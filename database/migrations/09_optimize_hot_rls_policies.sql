-- =============================================================================
-- Optimize authentication function evaluation in verified hot RLS policies.
-- Wrapping auth helpers in scalar subqueries lets PostgreSQL evaluate them once
-- per statement instead of once per candidate row.
-- =============================================================================

ALTER POLICY "Allow tenant members write access to companies"
  ON public.companies
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Allow users to view authorized companies"
  ON public.companies
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Company delivery bookings access"
  ON public.delivery_bookings
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      WHERE c.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    )
  );

ALTER POLICY "Allow company members to view attendance logs"
  ON public.attendance_logs
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Employees can insert their own attendance logs"
  ON public.attendance_logs
  WITH CHECK ((SELECT auth.uid()) = employee_id);

ALTER POLICY "HR module attendance_logs"
  ON public.attendance_logs
  USING (
    public.has_module_access((SELECT auth.uid()), company_id, 'HR')
  )
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'HR')
  );

ALTER POLICY "Operations module installation_bookings"
  ON public.installation_bookings
  USING (
    public.has_module_access((SELECT auth.uid()), company_id, 'Operations')
  )
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'Operations')
  );

ALTER POLICY "Participants can read chat thread state"
  ON public.chat_thread_members
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.chat_threads thread
        ON thread.id = chat_thread_members.thread_id
      WHERE employee.id = chat_thread_members.employee_id
        AND employee.company_id = thread.company_id
        AND lower(employee.email) =
          lower((SELECT auth.jwt()) ->> 'email')
    )
  );

ALTER POLICY "Allow members insert chats"
  ON public.employee_chats
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      WHERE c.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.company_id = employee_chats.company_id
        AND employee.id = employee_chats.sender_id
        AND lower(employee.email) =
          lower((SELECT auth.jwt()) ->> 'email')
    )
  );

ALTER POLICY "Allow members read company chats"
  ON public.employee_chats
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      WHERE c.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.company_id = employee_chats.company_id
        AND employee.id = ANY (
          ARRAY[employee_chats.sender_id, employee_chats.receiver_id]
        )
        AND lower(employee.email) =
          lower((SELECT auth.jwt()) ->> 'email')
    )
  );
