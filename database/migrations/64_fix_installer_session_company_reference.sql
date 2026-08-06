-- Qualify installer account columns that collide with RETURNS TABLE output
-- variables (notably company_id) inside the installer login RPC.
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
  FROM public.employees AS employee
  JOIN public.installer_accounts AS account
    ON account.employee_id = employee.id
   AND account.company_id = employee.company_id
  WHERE lower(coalesce(employee.employment_status, '')) = 'active'
    AND (
      lower(coalesce(employee.assignment, '')) ~ '(^|,\s*)installers?(\s*,|$)'
      OR lower(coalesce(employee.title, '')) LIKE '%installer%'
    )
    AND lower(trim(account.password)) = lower(trim(p_password))
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.installer_accounts AS account
  SET last_login_at = now(),
      updated_at = now()
  WHERE account.employee_id = matched_employee.id
    AND account.company_id = matched_employee.company_id;

  DELETE FROM public.installer_sessions AS session
  WHERE session.expires_at <= now()
     OR session.employee_id = matched_employee.id;

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
