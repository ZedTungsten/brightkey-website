-- =============================================================================
-- Expose the authenticated installer's payroll calculation inputs without
-- restoring anonymous access to the employees table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_installer_payout_profile(p_token UUID)
RETURNS TABLE (
  salary NUMERIC,
  date_hired DATE,
  shift_days TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.salary,
    employee.date_hired,
    employee.shift_days::TEXT
  FROM public.installer_sessions session
  JOIN public.employees employee
    ON employee.id = session.employee_id
   AND employee.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_installer_payout_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_payout_profile(UUID) TO anon;
