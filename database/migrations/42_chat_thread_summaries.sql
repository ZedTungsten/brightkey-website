-- Migration 42: Indexed direct-message threads and server-maintained unread counts.

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  participant_one_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  participant_two_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  last_message_id UUID,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (participant_one_id <> participant_two_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_unique_pair
  ON public.chat_threads (company_id, participant_one_id, participant_two_id);

CREATE INDEX IF NOT EXISTS chat_threads_recent_idx
  ON public.chat_threads (company_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_thread_members (
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_read_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, employee_id)
);

CREATE INDEX IF NOT EXISTS chat_thread_members_employee_idx
  ON public.chat_thread_members (employee_id, thread_id);

ALTER TABLE public.employee_chats
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE;

INSERT INTO public.chat_threads (company_id, participant_one_id, participant_two_id)
SELECT DISTINCT
  company_id,
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id)
FROM public.employee_chats
ON CONFLICT (company_id, participant_one_id, participant_two_id) DO NOTHING;

UPDATE public.employee_chats message
SET thread_id = thread.id
FROM public.chat_threads thread
WHERE message.thread_id IS NULL
  AND thread.company_id = message.company_id
  AND thread.participant_one_id = LEAST(message.sender_id, message.receiver_id)
  AND thread.participant_two_id = GREATEST(message.sender_id, message.receiver_id);

INSERT INTO public.chat_thread_members (thread_id, employee_id)
SELECT id, participant_one_id FROM public.chat_threads
UNION
SELECT id, participant_two_id FROM public.chat_threads
ON CONFLICT (thread_id, employee_id) DO NOTHING;

WITH latest AS (
  SELECT DISTINCT ON (thread_id)
    thread_id,
    id,
    message,
    created_at
  FROM public.employee_chats
  WHERE thread_id IS NOT NULL
  ORDER BY thread_id, created_at DESC, id DESC
)
UPDATE public.chat_threads thread
SET last_message_id = latest.id,
    last_message_preview = left(latest.message, 160),
    last_message_at = latest.created_at
FROM latest
WHERE thread.id = latest.thread_id;

ALTER TABLE public.chat_threads
  DROP CONSTRAINT IF EXISTS chat_threads_last_message_id_fkey,
  ADD CONSTRAINT chat_threads_last_message_id_fkey
    FOREIGN KEY (last_message_id) REFERENCES public.employee_chats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employee_chats_thread_page_idx
  ON public.employee_chats (thread_id, created_at DESC, id DESC);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_thread_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read chat threads" ON public.chat_threads
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.company_id = chat_threads.company_id
        AND employee.id IN (chat_threads.participant_one_id, chat_threads.participant_two_id)
        AND lower(employee.email) = lower(auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Participants can read chat thread state" ON public.chat_thread_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.chat_threads thread ON thread.id = chat_thread_members.thread_id
      WHERE employee.id = chat_thread_members.employee_id
        AND employee.company_id = thread.company_id
        AND lower(employee.email) = lower(auth.jwt() ->> 'email')
    )
  );

CREATE OR REPLACE FUNCTION public.send_employee_chat(
  p_receiver_id UUID,
  p_message TEXT
)
RETURNS public.employee_chats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender public.employees%ROWTYPE;
  v_receiver public.employees%ROWTYPE;
  v_thread_id UUID;
  v_message public.employee_chats%ROWTYPE;
  v_first_id UUID;
  v_second_id UUID;
BEGIN
  IF auth.uid() IS NULL OR nullif(btrim(p_message), '') IS NULL THEN
    RAISE EXCEPTION 'A signed-in user and non-empty message are required';
  END IF;

  SELECT * INTO v_receiver
  FROM public.employees
  WHERE id = p_receiver_id;

  IF v_receiver.id IS NULL THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  SELECT * INTO v_sender
  FROM public.employees
  WHERE company_id = v_receiver.company_id
    AND lower(email) = lower(auth.jwt() ->> 'email')
  LIMIT 1;

  IF v_sender.id IS NULL OR v_sender.id = v_receiver.id THEN
    RAISE EXCEPTION 'Invalid chat participants';
  END IF;

  IF v_sender.company_id NOT IN (
    SELECT id FROM public.companies
    WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Chat company access denied';
  END IF;

  v_first_id := LEAST(v_sender.id, v_receiver.id);
  v_second_id := GREATEST(v_sender.id, v_receiver.id);

  INSERT INTO public.chat_threads (company_id, participant_one_id, participant_two_id)
  VALUES (v_sender.company_id, v_first_id, v_second_id)
  ON CONFLICT (company_id, participant_one_id, participant_two_id)
  DO UPDATE SET company_id = EXCLUDED.company_id
  RETURNING id INTO v_thread_id;

  INSERT INTO public.chat_thread_members (thread_id, employee_id)
  VALUES (v_thread_id, v_sender.id), (v_thread_id, v_receiver.id)
  ON CONFLICT (thread_id, employee_id) DO NOTHING;

  INSERT INTO public.employee_chats (thread_id, company_id, sender_id, receiver_id, message)
  VALUES (v_thread_id, v_sender.company_id, v_sender.id, v_receiver.id, btrim(p_message))
  RETURNING * INTO v_message;

  UPDATE public.chat_threads
  SET last_message_id = v_message.id,
      last_message_preview = left(v_message.message, 160),
      last_message_at = v_message.created_at
  WHERE id = v_thread_id;

  UPDATE public.chat_thread_members
  SET unread_count = unread_count + 1,
      updated_at = now()
  WHERE thread_id = v_thread_id
    AND employee_id = v_receiver.id;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_chat_thread_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  SELECT member.employee_id INTO v_employee_id
  FROM public.chat_thread_members member
  JOIN public.employees employee ON employee.id = member.employee_id
  WHERE member.thread_id = p_thread_id
    AND lower(employee.email) = lower(auth.jwt() ->> 'email')
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Chat thread access denied';
  END IF;

  UPDATE public.chat_thread_members
  SET unread_count = 0,
      last_read_at = now(),
      updated_at = now()
  WHERE thread_id = p_thread_id
    AND employee_id = v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_chat_inbox()
RETURNS TABLE (
  thread_id UUID,
  other_employee_id UUID,
  first_name TEXT,
  last_name TEXT,
  picture_link TEXT,
  status_text TEXT,
  unread_count INTEGER,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    thread.id,
    other_employee.id,
    other_employee.first_name::TEXT,
    other_employee.last_name::TEXT,
    other_employee.picture_link::TEXT,
    other_employee.status_text::TEXT,
    member.unread_count,
    thread.last_message_preview,
    thread.last_message_at
  FROM public.chat_thread_members member
  JOIN public.chat_threads thread ON thread.id = member.thread_id
  JOIN public.employees me ON me.id = member.employee_id
  JOIN public.employees other_employee
    ON other_employee.id = CASE
      WHEN thread.participant_one_id = member.employee_id THEN thread.participant_two_id
      ELSE thread.participant_one_id
    END
  WHERE lower(me.email) = lower(auth.jwt() ->> 'email')
    AND thread.company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  ORDER BY thread.last_message_at DESC NULLS LAST
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.send_employee_chat(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_chat_thread_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_employee_chat_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_employee_chat(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_thread_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_chat_inbox() TO authenticated;
GRANT SELECT ON public.chat_threads, public.chat_thread_members TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'chat_thread_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_thread_members;
    END IF;
  END IF;
END $$;
