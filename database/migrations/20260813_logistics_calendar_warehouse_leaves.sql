CREATE OR REPLACE FUNCTION public.get_warehouse_staff_approved_leaves(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  date_from DATE,
  date_to DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies company
    JOIN public.tenant_members member
      ON member.tenant_id = company.tenant_id
    WHERE company.id = p_company_id
      AND member.user_id = auth.uid()
      AND (
        lower(coalesce(member.role, '')) IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) access
          WHERE lower(trim(access)) = 'logistics'
             OR lower(trim(access)) LIKE 'logistics:%'
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    employee.id,
    trim(concat_ws(' ', employee.first_name, employee.last_name)),
    request.date_from,
    request.date_to
  FROM public.leave_requests request
  JOIN public.employees employee
    ON employee.id = request.employee_id
   AND employee.company_id = request.company_id
  WHERE request.company_id = p_company_id
    AND lower(request.status) = 'approved'
    AND request.date_from <= p_end_date
    AND request.date_to >= p_start_date
    AND 'warehouse staff' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
  ORDER BY request.date_from, employee.first_name, employee.last_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_staff_approved_leaves(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warehouse_staff_approved_leaves(UUID, DATE, DATE) TO authenticated;
