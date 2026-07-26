-- =============================================================================
-- Revoke SmartLock Calendar access as soon as an employee is no longer active.
-- New logins are already restricted to employment_status = 'Active'.
-- =============================================================================

DELETE FROM public.installer_sessions session
USING public.employees employee
WHERE employee.id = session.employee_id
  AND lower(trim(coalesce(employee.employment_status, ''))) <> 'active';

CREATE OR REPLACE FUNCTION public.revoke_inactive_installer_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(trim(coalesce(NEW.employment_status, ''))) <> 'active' THEN
    DELETE FROM public.installer_sessions
    WHERE employee_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'revoke_inactive_installer_sessions'
      AND tgrelid = 'public.employees'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER revoke_inactive_installer_sessions
    AFTER UPDATE OF employment_status ON public.employees
    FOR EACH ROW
    WHEN (OLD.employment_status IS DISTINCT FROM NEW.employment_status)
    EXECUTE FUNCTION public.revoke_inactive_installer_sessions();
  END IF;
END;
$$;

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
    AND lower(trim(coalesce(employee.employment_status, ''))) = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_installer_payout_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_payout_profile(UUID) TO anon;
