-- Scale dashboard chat without changing participant or tenant visibility.
-- Persistent messages remain in public.employee_chats; Realtime broadcasts are
-- only an invalidation/delivery transport and are never the source of truth.

CREATE OR REPLACE FUNCTION public.get_employee_chat_unread_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(member.unread_count), 0)::BIGINT
  FROM public.chat_thread_members AS member
  JOIN public.chat_threads AS thread
    ON thread.id = member.thread_id
  JOIN public.employees AS employee
    ON employee.id = member.employee_id
   AND employee.company_id = thread.company_id
  WHERE lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND thread.company_id IN (
      SELECT company.id
      FROM public.companies AS company
      WHERE company.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_employee_chat_unread_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_chat_unread_total() TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_employee_chat_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    to_jsonb(NEW),
    'chat_message',
    'employee:' || NEW.sender_id::TEXT || ':chat',
    TRUE
  );

  PERFORM realtime.send(
    to_jsonb(NEW),
    'chat_message',
    'employee:' || NEW.receiver_id::TEXT || ':chat',
    TRUE
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_employee_chat_insert() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'broadcast_employee_chat_insert_trigger'
      AND tgrelid = 'public.employee_chats'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER broadcast_employee_chat_insert_trigger
      AFTER INSERT ON public.employee_chats
      FOR EACH ROW
      EXECUTE FUNCTION public.broadcast_employee_chat_insert();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.broadcast_employee_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_company_id UUID;
BEGIN
  SELECT employee.company_id
  INTO target_company_id
  FROM public.employees AS employee
  WHERE employee.id = NEW.employee_id;

  IF target_company_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'employee_id', NEW.employee_id,
        'status', NEW.status,
        'created_at', NEW.created_at
      ),
      'presence_changed',
      'company:' || target_company_id::TEXT || ':chat',
      TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_employee_presence_change() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'broadcast_employee_presence_change_trigger'
      AND tgrelid = 'public.attendance_logs'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER broadcast_employee_presence_change_trigger
      AFTER INSERT ON public.attendance_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.broadcast_employee_presence_change();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'Chat participants can receive private broadcasts'
  ) THEN
    CREATE POLICY "Chat participants can receive private broadcasts"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        (
          realtime.topic() LIKE 'employee:%:chat'
          AND EXISTS (
            SELECT 1
            FROM public.employees AS employee
            JOIN public.companies AS company
              ON company.id = employee.company_id
            WHERE realtime.topic() = 'employee:' || employee.id::TEXT || ':chat'
              AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
              AND company.tenant_id IN (
                SELECT public.get_user_tenants((SELECT auth.uid()))
              )
          )
        )
        OR
        (
          realtime.topic() LIKE 'company:%:chat'
          AND EXISTS (
            SELECT 1
            FROM public.companies AS company
            WHERE realtime.topic() = 'company:' || company.id::TEXT || ':chat'
              AND company.tenant_id IN (
                SELECT public.get_user_tenants((SELECT auth.uid()))
              )
          )
        )
      );
  END IF;
END
$$;
