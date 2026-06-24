-- Migration 38: Enable realtime delivery for employee chat and presence.
-- Supabase Realtime only streams tables added to the supabase_realtime publication.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'employee_chats'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_chats;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'attendance_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow members read company chats" ON public.employee_chats;
CREATE POLICY "Allow members read company chats" ON public.employee_chats
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = employee_chats.company_id
        AND e.id IN (employee_chats.sender_id, employee_chats.receiver_id)
        AND lower(e.email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "Allow members insert chats" ON public.employee_chats;
CREATE POLICY "Allow members insert chats" ON public.employee_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = employee_chats.company_id
        AND e.id = employee_chats.sender_id
        AND lower(e.email) = lower(auth.jwt() ->> 'email')
    )
  );
