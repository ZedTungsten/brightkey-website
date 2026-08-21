-- Employee records use their own primary keys; they are not keyed by auth.users.id.
-- Match self-service updates through the verified account email and tenant access.

DROP POLICY IF EXISTS "Employees can update their own profile details" ON public.employees;

CREATE POLICY "Employees can update their own profile details"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (
    lower(coalesce(employees.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND EXISTS (
      SELECT 1
      FROM public.companies company
      WHERE company.id = employees.company_id
        AND company.tenant_id IN (
          SELECT public.get_user_tenants(auth.uid())
        )
    )
  )
  WITH CHECK (
    lower(coalesce(employees.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND EXISTS (
      SELECT 1
      FROM public.companies company
      WHERE company.id = employees.company_id
        AND company.tenant_id IN (
          SELECT public.get_user_tenants(auth.uid())
        )
    )
  );
