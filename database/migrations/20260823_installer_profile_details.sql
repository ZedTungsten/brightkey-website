CREATE OR REPLACE FUNCTION public.get_installer_profile_details(p_token UUID)
RETURNS TABLE (date_hired DATE, profile_picture_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT employee.date_hired, employee.picture_link AS profile_picture_url
  FROM public.installer_sessions session
  JOIN public.employees employee
    ON employee.id = session.employee_id
   AND employee.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND lower(trim(coalesce(employee.employment_status, ''))) = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_installer_profile_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_profile_details(UUID) TO anon;
