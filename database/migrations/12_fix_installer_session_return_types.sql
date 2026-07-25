-- =============================================================================
-- Match the installer-session RPC's declared TEXT fields to live employee
-- columns that use VARCHAR. PostgreSQL does not implicitly coerce function
-- result columns when validating a RETURN QUERY row shape.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees employee
  WHERE employee.employment_status = 'Active'
    AND 'installer' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
    AND lower(trim(p_password)) =
      lower(
        left(trim(coalesce(employee.first_name, '')), 1)
        || left(trim(coalesce(employee.last_name, '')), 1)
        || right(
          regexp_replace(
            coalesce(employee.emergency_contact_number, ''),
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      )
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.installer_sessions
  WHERE expires_at <= now()
     OR employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name::TEXT,
    matched_employee.last_name::TEXT,
    matched_employee.contact_number::TEXT,
    matched_employee.company_id,
    matched_employee.assignment::TEXT,
    matched_employee.email::TEXT,
    matched_employee.department::TEXT,
    matched_employee.title::TEXT,
    matched_employee.employment_status::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;
