-- =============================================================================
-- Remove anonymous access to employee PII and inventory operations.
-- The installer portal keeps its existing PIN format, but validation now occurs
-- inside Postgres and returns only the fields the portal needs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.authenticate_installer(p_password TEXT)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.id,
    employee.first_name,
    employee.last_name,
    employee.contact_number,
    employee.company_id,
    employee.assignment,
    employee.email,
    employee.department,
    employee.title,
    employee.employment_status
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
$$;

REVOKE ALL ON FUNCTION public.authenticate_installer(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_installer(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Public read employees." ON public.employees;

DROP POLICY IF EXISTS "Allow public select" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public insert" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public update" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public delete" ON public.inventory_transactions;
