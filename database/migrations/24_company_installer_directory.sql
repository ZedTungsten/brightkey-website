-- =============================================================================
-- Tenant-safe installer directory for booking assignment controls.
-- Returns only fields needed by the booking UI without exposing full HR records.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_company_installer_directory(
  p_company_id UUID
)
RETURNS TABLE (
  id UUID,
  employee_number TEXT,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  department TEXT,
  assignment TEXT,
  city TEXT,
  picture_link TEXT,
  employment_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.id,
    employee.employee_number,
    employee.first_name,
    employee.last_name,
    employee.title,
    employee.department,
    employee.assignment,
    employee.city,
    employee.picture_link,
    employee.employment_status
  FROM public.employees employee
  WHERE employee.company_id = p_company_id
    AND EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member
        ON member.tenant_id = company.tenant_id
      WHERE company.id = p_company_id
        AND member.user_id = (SELECT auth.uid())
    )
  ORDER BY employee.first_name, employee.last_name, employee.id;
$$;

REVOKE ALL ON FUNCTION public.get_company_installer_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_installer_directory(UUID) TO authenticated;

