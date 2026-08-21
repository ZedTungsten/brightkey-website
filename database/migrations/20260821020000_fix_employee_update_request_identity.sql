-- Employee directory IDs are independent from auth.users IDs. Authorize
-- self-service requests through the employee's verified email and tenant.

DROP POLICY IF EXISTS "Users can submit their own update requests"
  ON public.employee_update_requests;
DROP POLICY IF EXISTS "Users can view their own update requests"
  ON public.employee_update_requests;

CREATE POLICY "Users can submit their own update requests"
  ON public.employee_update_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.companies company
        ON company.id = employee.company_id
      WHERE employee.id = employee_update_requests.employee_id
        AND company.tenant_id = employee_update_requests.tenant_id
        AND company.tenant_id IN (
          SELECT public.get_user_tenants(auth.uid())
        )
        AND lower(coalesce(employee.email, '')) =
            lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY "Users can view their own update requests"
  ON public.employee_update_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.companies company
        ON company.id = employee.company_id
      WHERE employee.id = employee_update_requests.employee_id
        AND company.tenant_id = employee_update_requests.tenant_id
        AND company.tenant_id IN (
          SELECT public.get_user_tenants(auth.uid())
        )
        AND lower(coalesce(employee.email, '')) =
            lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
