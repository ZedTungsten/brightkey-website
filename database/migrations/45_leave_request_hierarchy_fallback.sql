-- Resolve leave approvers through the organization structure when an employee
-- has no explicit reporting_to assignment. Direct assignments always win.

CREATE OR REPLACE FUNCTION public.resolve_employee_leave_manager(
  p_employee_id UUID,
  p_company_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_structure JSONB;
  v_department JSONB;
  v_team JSONB;
  v_department_manager UUID;
  v_team_manager UUID;
BEGIN
  SELECT employee.*
  INTO v_employee
  FROM public.employees employee
  WHERE employee.id = p_employee_id
    AND employee.company_id = p_company_id
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_employee.reporting_to IS NOT NULL THEN
    RETURN nullif(v_employee.reporting_to::TEXT, '')::UUID;
  END IF;

  SELECT setting.value
  INTO v_structure
  FROM public.global_settings setting
  WHERE setting.company_id = p_company_id
    AND setting.key = 'company_structure'
  LIMIT 1;

  FOR v_department IN
    SELECT value
    FROM jsonb_array_elements(coalesce(v_structure -> 'departments', '[]'::JSONB))
  LOOP
    v_department_manager := CASE
      WHEN nullif(v_department ->> 'managerId', '') IS NULL THEN NULL
      ELSE (v_department ->> 'managerId')::UUID
    END;

    FOR v_team IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_department -> 'subteams', '[]'::JSONB))
    LOOP
      v_team_manager := CASE
        WHEN nullif(v_team ->> 'managerId', '') IS NULL THEN NULL
        ELSE (v_team ->> 'managerId')::UUID
      END;

      IF v_team_manager = p_employee_id THEN
        RETURN v_department_manager;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_team -> 'colleagueIds', '[]'::JSONB)) colleague(employee_id)
        WHERE colleague.employee_id = p_employee_id::TEXT
      ) THEN
        RETURN coalesce(v_team_manager, v_department_manager);
      END IF;
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_employee_leave_manager(UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.decide_direct_report_leave_request(
  p_request_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  request_id UUID,
  request_status TEXT,
  vacation_leave_load NUMERIC,
  sick_leave_load NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manager public.employees%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_request public.leave_requests%ROWTYPE;
  v_decision TEXT := lower(trim(coalesce(p_decision, '')));
  v_days NUMERIC;
  v_effective_manager_id UUID;
BEGIN
  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid leave request decision';
  END IF;

  SELECT employee.*
  INTO v_manager
  FROM public.employees employee
  JOIN auth.users account
    ON lower(account.email) = lower(employee.email)
  WHERE account.id = auth.uid()
    AND lower(coalesce(employee.employment_status, '')) = 'active'
  LIMIT 1;

  IF v_manager.id IS NULL THEN
    RAISE EXCEPTION 'Active manager profile not found';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.leave_requests request
  WHERE request.id = p_request_id
    AND request.company_id = v_manager.company_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;

  IF lower(coalesce(v_request.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Leave request has already been decided';
  END IF;

  SELECT employee.*
  INTO v_employee
  FROM public.employees employee
  WHERE employee.id = v_request.employee_id
    AND employee.company_id = v_manager.company_id
  FOR UPDATE;

  v_effective_manager_id := public.resolve_employee_leave_manager(
    v_employee.id,
    v_manager.company_id
  );

  IF v_employee.id IS NULL OR v_effective_manager_id IS DISTINCT FROM v_manager.id THEN
    RAISE EXCEPTION 'Only the employee''s assigned leave manager can decide this request';
  END IF;

  v_days := greatest(coalesce(v_request.number_of_days, 0), 0);

  IF v_decision = 'approved' THEN
    IF lower(coalesce(v_request.leave_type, '')) = 'vacation' THEN
      IF coalesce(v_employee.vl_load, 0) < v_days THEN
        RAISE EXCEPTION 'Employee has insufficient vacation leave balance';
      END IF;

      UPDATE public.employees
      SET vl_load = coalesce(vl_load, 0) - v_days,
          updated_at = now()
      WHERE id = v_employee.id
        AND company_id = v_manager.company_id;
    ELSIF lower(coalesce(v_request.leave_type, '')) = 'sick' THEN
      IF coalesce(v_employee.sl_load, 0) < v_days THEN
        RAISE EXCEPTION 'Employee has insufficient sick leave balance';
      END IF;

      UPDATE public.employees
      SET sl_load = coalesce(sl_load, 0) - v_days,
          updated_at = now()
      WHERE id = v_employee.id
        AND company_id = v_manager.company_id;
    ELSE
      RAISE EXCEPTION 'Unsupported leave type';
    END IF;

    UPDATE public.leave_requests
    SET status = 'approved'
    WHERE id = v_request.id
      AND company_id = v_manager.company_id;
  ELSE
    IF nullif(trim(coalesce(p_rejection_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required';
    END IF;

    UPDATE public.leave_requests
    SET status = 'rejected',
        rejected_reason = trim(p_rejection_reason)
    WHERE id = v_request.id
      AND company_id = v_manager.company_id;
  END IF;

  RETURN QUERY
  SELECT
    v_request.id,
    v_decision,
    employee.vl_load,
    employee.sl_load
  FROM public.employees employee
  WHERE employee.id = v_employee.id
    AND employee.company_id = v_manager.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_direct_report_leave_request(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_direct_report_leave_request(UUID, TEXT, TEXT) TO authenticated;
