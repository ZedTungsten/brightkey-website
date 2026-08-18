-- Generalize the existing direct-message model for direct, group, and company chat.
-- Existing thread/message identifiers and history are preserved in place.

ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS thread_type TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.chat_threads ALTER COLUMN participant_one_id DROP NOT NULL;
ALTER TABLE public.chat_threads ALTER COLUMN participant_two_id DROP NOT NULL;

ALTER TABLE public.chat_thread_members ADD COLUMN IF NOT EXISTS member_role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.chat_thread_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.chat_thread_members ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

ALTER TABLE public.employee_chats ALTER COLUMN receiver_id DROP NOT NULL;

UPDATE public.chat_threads
SET thread_type = 'direct',
    created_by = COALESCE(created_by, participant_one_id),
    updated_at = COALESCE(last_message_at, created_at)
WHERE thread_type = 'direct';

UPDATE public.chat_thread_members AS member
SET member_role = CASE
  WHEN member.employee_id = thread.created_by THEN 'owner'
  ELSE 'member'
END
FROM public.chat_threads AS thread
WHERE thread.id = member.thread_id
  AND thread.thread_type = 'direct';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_type_check') THEN
    ALTER TABLE public.chat_threads ADD CONSTRAINT chat_threads_type_check
      CHECK (thread_type IN ('direct', 'group', 'company'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_participants_check') THEN
    ALTER TABLE public.chat_threads ADD CONSTRAINT chat_threads_participants_check
      CHECK (
        (thread_type = 'direct' AND participant_one_id IS NOT NULL AND participant_two_id IS NOT NULL)
        OR (thread_type IN ('group', 'company') AND participant_one_id IS NULL AND participant_two_id IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_members_role_check') THEN
    ALTER TABLE public.chat_thread_members ADD CONSTRAINT chat_thread_members_role_check
      CHECK (member_role IN ('owner', 'admin', 'member'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_company_channel_idx
  ON public.chat_threads(company_id)
  WHERE thread_type = 'company';
CREATE INDEX IF NOT EXISTS chat_thread_members_active_employee_idx
  ON public.chat_thread_members(employee_id, updated_at DESC, thread_id)
  WHERE removed_at IS NULL;

INSERT INTO public.chat_threads (company_id, thread_type, name, created_at, updated_at)
SELECT company.id, 'company', 'Company', now(), now()
FROM public.companies AS company
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_threads AS thread
  WHERE thread.company_id = company.id AND thread.thread_type = 'company'
);

INSERT INTO public.chat_thread_members (thread_id, employee_id, member_role)
SELECT thread.id, employee.id, 'member'
FROM public.chat_threads AS thread
JOIN public.employees AS employee ON employee.company_id = thread.company_id
WHERE thread.thread_type = 'company'
ON CONFLICT (thread_id, employee_id) DO UPDATE SET removed_at = NULL;

CREATE OR REPLACE FUNCTION public.sync_employee_company_chat_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.chat_thread_members (thread_id, employee_id, member_role)
  SELECT thread.id, NEW.id, 'member'
  FROM public.chat_threads AS thread
  WHERE thread.company_id = NEW.company_id AND thread.thread_type = 'company'
  ON CONFLICT (thread_id, employee_id) DO UPDATE SET removed_at = NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_employee_company_chat_membership() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_employee_company_chat_membership_trigger' AND NOT tgisinternal) THEN
    CREATE TRIGGER sync_employee_company_chat_membership_trigger
      AFTER INSERT OR UPDATE OF company_id ON public.employees
      FOR EACH ROW EXECUTE FUNCTION public.sync_employee_company_chat_membership();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_chat_workspace_inbox()
RETURNS TABLE (
  thread_id UUID, thread_type TEXT, display_name TEXT, picture_link TEXT,
  last_message_preview TEXT, last_message_at TIMESTAMPTZ, unread_count INTEGER,
  member_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_employee public.employees%ROWTYPE;
BEGIN
  SELECT employee.* INTO current_employee
  FROM public.employees AS employee
  JOIN public.companies AS company ON company.id = employee.company_id
  WHERE lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  LIMIT 1;
  IF current_employee.id IS NULL THEN RAISE EXCEPTION 'Chat access denied'; END IF;

  RETURN QUERY
  SELECT thread.id, thread.thread_type,
    CASE WHEN thread.thread_type = 'direct'
      THEN concat_ws(' ', other_employee.first_name, other_employee.last_name)
      ELSE COALESCE(NULLIF(thread.name, ''), 'Untitled conversation') END,
    CASE WHEN thread.thread_type = 'direct' THEN other_employee.picture_link::TEXT ELSE NULL END,
    thread.last_message_preview, thread.last_message_at, member.unread_count,
    (SELECT count(*) FROM public.chat_thread_members AS counted
      WHERE counted.thread_id = thread.id AND counted.removed_at IS NULL)
  FROM public.chat_thread_members AS member
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id
  LEFT JOIN public.employees AS other_employee ON other_employee.id = CASE
    WHEN thread.thread_type = 'direct' AND thread.participant_one_id = current_employee.id THEN thread.participant_two_id
    WHEN thread.thread_type = 'direct' THEN thread.participant_one_id ELSE NULL END
  WHERE member.employee_id = current_employee.id
    AND member.removed_at IS NULL
    AND thread.company_id = current_employee.company_id
  ORDER BY thread.last_message_at DESC NULLS LAST, thread.created_at DESC
  LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_workspace_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_workspace_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_chat_thread_messages(
  p_thread_id UUID, p_before_created_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID, thread_id UUID, sender_id UUID, sender_name TEXT,
  sender_picture TEXT, message TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_employee_id UUID;
BEGIN
  SELECT employee.id INTO current_employee_id
  FROM public.employees AS employee
  JOIN public.chat_thread_members AS member ON member.employee_id = employee.id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
    AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  LIMIT 1;
  IF current_employee_id IS NULL THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;

  RETURN QUERY
  SELECT chat.id, chat.thread_id, chat.sender_id,
    concat_ws(' ', sender.first_name, sender.last_name), sender.picture_link::TEXT,
    chat.message, chat.created_at
  FROM public.employee_chats AS chat
  JOIN public.employees AS sender ON sender.id = chat.sender_id
  WHERE chat.thread_id = p_thread_id
    AND (p_before_created_at IS NULL OR chat.created_at < p_before_created_at
      OR (chat.created_at = p_before_created_at AND chat.id < p_before_id))
  ORDER BY chat.created_at DESC, chat.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_thread_messages(UUID, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages(UUID, TIMESTAMPTZ, UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_chat_thread_members(p_thread_id UUID)
RETURNS TABLE (employee_id UUID, full_name TEXT, picture_link TEXT, member_role TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_thread_members AS mine
    JOIN public.employees AS employee ON employee.id = mine.employee_id
    JOIN public.chat_threads AS thread ON thread.id = mine.thread_id AND thread.company_id = employee.company_id
    JOIN public.companies AS company ON company.id = thread.company_id
    WHERE mine.thread_id = p_thread_id AND mine.removed_at IS NULL
      AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
      AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  ) THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  RETURN QUERY SELECT member.employee_id,
    concat_ws(' ', employee.first_name, employee.last_name), employee.picture_link::TEXT, member.member_role
  FROM public.chat_thread_members AS member
  JOIN public.employees AS employee ON employee.id = member.employee_id
  WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
  ORDER BY CASE member.member_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    employee.first_name, employee.last_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_thread_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_members(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_chat(p_name TEXT, p_member_ids UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE creator public.employees%ROWTYPE; new_thread_id UUID;
BEGIN
  SELECT employee.* INTO creator FROM public.employees AS employee
  JOIN public.companies AS company ON company.id = employee.company_id
  WHERE lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid()))) LIMIT 1;
  IF creator.id IS NULL OR nullif(btrim(p_name), '') IS NULL THEN RAISE EXCEPTION 'A group name is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_member_ids, ARRAY[]::UUID[])) AS requested(member_id)
    LEFT JOIN public.employees AS employee ON employee.id = requested.member_id
      AND employee.company_id = creator.company_id
    WHERE employee.id IS NULL
  ) THEN RAISE EXCEPTION 'Invalid group member'; END IF;
  INSERT INTO public.chat_threads(company_id, thread_type, name, created_by)
  VALUES (creator.company_id, 'group', left(btrim(p_name), 120), creator.id) RETURNING id INTO new_thread_id;
  INSERT INTO public.chat_thread_members(thread_id, employee_id, member_role)
  SELECT DISTINCT new_thread_id, member_id, CASE WHEN member_id = creator.id THEN 'owner' ELSE 'member' END
  FROM unnest(array_append(COALESCE(p_member_ids, ARRAY[]::UUID[]), creator.id)) AS member_id
  ON CONFLICT (thread_id, employee_id) DO NOTHING;
  RETURN new_thread_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_group_chat(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_chat_thread_message(p_thread_id UUID, p_message TEXT)
RETURNS public.employee_chats LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sender public.employees%ROWTYPE; target_thread public.chat_threads%ROWTYPE; receiver UUID; sent public.employee_chats%ROWTYPE;
BEGIN
  IF nullif(btrim(p_message), '') IS NULL OR length(btrim(p_message)) > 5000 THEN RAISE EXCEPTION 'Message must contain 1 to 5000 characters'; END IF;
  SELECT employee.* INTO sender FROM public.employees AS employee
  JOIN public.chat_thread_members AS member ON member.employee_id = employee.id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
    AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid()))) LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  SELECT * INTO target_thread FROM public.chat_threads WHERE id = p_thread_id;
  IF target_thread.thread_type = 'direct' THEN
    receiver := CASE WHEN target_thread.participant_one_id = sender.id THEN target_thread.participant_two_id ELSE target_thread.participant_one_id END;
  END IF;
  INSERT INTO public.employee_chats(thread_id, company_id, sender_id, receiver_id, message)
  VALUES (p_thread_id, sender.company_id, sender.id, receiver, btrim(p_message)) RETURNING * INTO sent;
  UPDATE public.chat_threads SET last_message_id = sent.id, last_message_preview = left(sent.message, 160),
    last_message_at = sent.created_at, updated_at = sent.created_at WHERE id = p_thread_id;
  UPDATE public.chat_thread_members SET unread_count = unread_count + 1, updated_at = now()
  WHERE thread_id = p_thread_id AND employee_id <> sender.id AND removed_at IS NULL;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_thread_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_thread_message(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_employee_chat_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM realtime.send(to_jsonb(NEW), 'chat_message', 'thread:' || NEW.thread_id::TEXT || ':chat', TRUE);
  PERFORM realtime.send(jsonb_build_object('thread_id', NEW.thread_id, 'sender_id', NEW.sender_id, 'created_at', NEW.created_at),
    'chat_inbox_changed', 'company:' || NEW.company_id::TEXT || ':chat', TRUE);
  IF NEW.receiver_id IS NOT NULL THEN
    PERFORM realtime.send(to_jsonb(NEW), 'chat_message', 'employee:' || NEW.sender_id::TEXT || ':chat', TRUE);
    PERFORM realtime.send(to_jsonb(NEW), 'chat_message', 'employee:' || NEW.receiver_id::TEXT || ':chat', TRUE);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_employee_chat_insert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.is_chat_thread_member(p_thread_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_thread_members AS member
    JOIN public.employees AS employee ON employee.id = member.employee_id
    JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
    JOIN public.companies AS company ON company.id = thread.company_id
    WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
      AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
      AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  );
$$;
REVOKE ALL ON FUNCTION public.is_chat_thread_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_thread_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_employee_chat_unread_total()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(SUM(member.unread_count), 0)::BIGINT
  FROM public.chat_thread_members AS member
  JOIN public.employees AS employee ON employee.id = member.employee_id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.removed_at IS NULL
    AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.get_employee_chat_unread_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_chat_unread_total() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_threads' AND policyname='Members can read generalized chat threads') THEN
    CREATE POLICY "Members can read generalized chat threads" ON public.chat_threads FOR SELECT TO authenticated
      USING (public.is_chat_thread_member(chat_threads.id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='Chat members can receive thread broadcasts') THEN
    CREATE POLICY "Chat members can receive thread broadcasts" ON realtime.messages FOR SELECT TO authenticated USING (
      realtime.messages.extension = 'broadcast' AND realtime.topic() LIKE 'thread:%:chat'
      AND EXISTS (SELECT 1 FROM public.chat_thread_members AS member JOIN public.employees AS employee ON employee.id = member.employee_id
        WHERE realtime.topic() = 'thread:' || member.thread_id::TEXT || ':chat' AND member.removed_at IS NULL
          AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email'))
    );
  END IF;
END
$$;

ALTER POLICY "Members can read generalized chat threads" ON public.chat_threads
  USING (public.is_chat_thread_member(chat_threads.id));
