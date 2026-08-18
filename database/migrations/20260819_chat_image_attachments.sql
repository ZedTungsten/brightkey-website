-- Private, tenant-scoped JPEG attachments for direct, group, and company chat.

ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_mime TEXT;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_bytes BIGINT;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_width INTEGER;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_height INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_chats_attachment_check') THEN
    ALTER TABLE public.employee_chats ADD CONSTRAINT employee_chats_attachment_check CHECK (
      (attachment_path IS NULL AND attachment_mime IS NULL AND attachment_bytes IS NULL
        AND attachment_width IS NULL AND attachment_height IS NULL)
      OR (attachment_path IS NOT NULL AND attachment_mime = 'image/jpeg'
        AND attachment_bytes BETWEEN 1 AND 5242880
        AND attachment_width BETWEEN 1 AND 4096 AND attachment_height BETWEEN 1 AND 4096)
    );
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 5242880, ARRAY['image/jpeg']::TEXT[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg']::TEXT[];

CREATE OR REPLACE FUNCTION public.can_access_chat_media(p_company_id UUID, p_thread_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chat_threads AS thread
    WHERE thread.id = p_thread_id AND thread.company_id = p_company_id
      AND public.is_chat_thread_member(thread.id)
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_chat_media(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chat_media(UUID, UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Chat members can read chat media') THEN
    CREATE POLICY "Chat members can read chat media" ON storage.objects FOR SELECT TO authenticated USING (
      bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
      AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Chat members can upload chat media') THEN
    CREATE POLICY "Chat members can upload chat media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
      bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
      AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Chat uploaders can delete own media') THEN
    CREATE POLICY "Chat uploaders can delete own media" ON storage.objects FOR DELETE TO authenticated USING (
      bucket_id = 'chat-media' AND owner_id = (SELECT auth.uid())::TEXT
      AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
    );
  END IF;
END
$$;

ALTER POLICY "Chat members can read chat media" ON storage.objects USING (
  bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
);
ALTER POLICY "Chat members can upload chat media" ON storage.objects WITH CHECK (
  bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
);

CREATE OR REPLACE FUNCTION public.get_chat_thread_messages_v2(
  p_thread_id UUID, p_before_created_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID, thread_id UUID, sender_id UUID, sender_name TEXT, sender_picture TEXT,
  message TEXT, created_at TIMESTAMPTZ, attachment_path TEXT, attachment_mime TEXT,
  attachment_bytes BIGINT, attachment_width INTEGER, attachment_height INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_chat_thread_member(p_thread_id) THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  RETURN QUERY SELECT chat.id, chat.thread_id, chat.sender_id,
    concat_ws(' ', sender.first_name, sender.last_name), sender.picture_link::TEXT,
    chat.message, chat.created_at, chat.attachment_path, chat.attachment_mime,
    chat.attachment_bytes, chat.attachment_width, chat.attachment_height
  FROM public.employee_chats AS chat
  JOIN public.employees AS sender ON sender.id = chat.sender_id
  WHERE chat.thread_id = p_thread_id
    AND (p_before_created_at IS NULL OR chat.created_at < p_before_created_at
      OR (chat.created_at = p_before_created_at AND chat.id < p_before_id))
  ORDER BY chat.created_at DESC, chat.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_thread_messages_v2(UUID, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages_v2(UUID, TIMESTAMPTZ, UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_chat_thread_message_v2(
  p_thread_id UUID, p_message TEXT DEFAULT '', p_attachment_path TEXT DEFAULT NULL,
  p_attachment_mime TEXT DEFAULT NULL, p_attachment_bytes BIGINT DEFAULT NULL,
  p_attachment_width INTEGER DEFAULT NULL, p_attachment_height INTEGER DEFAULT NULL
)
RETURNS public.employee_chats LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sender public.employees%ROWTYPE; target_thread public.chat_threads%ROWTYPE;
  receiver UUID; sent public.employee_chats%ROWTYPE; clean_message TEXT := btrim(COALESCE(p_message, ''));
BEGIN
  SELECT employee.* INTO sender FROM public.employees AS employee
  JOIN public.chat_thread_members AS member ON member.employee_id = employee.id AND member.thread_id = p_thread_id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.removed_at IS NULL AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid()))) LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  IF length(clean_message) > 5000 OR (clean_message = '' AND p_attachment_path IS NULL) THEN
    RAISE EXCEPTION 'A message or image is required';
  END IF;
  IF p_attachment_path IS NOT NULL THEN
    IF p_attachment_mime <> 'image/jpeg' OR p_attachment_bytes NOT BETWEEN 1 AND 5242880
      OR p_attachment_width NOT BETWEEN 1 AND 4096 OR p_attachment_height NOT BETWEEN 1 AND 4096
      OR p_attachment_path !~* ('^companies/' || sender.company_id::TEXT || '/chat/' || p_thread_id::TEXT || '/[0-9a-f-]{36}\.jpg$')
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='chat-media' AND name=p_attachment_path)
    THEN RAISE EXCEPTION 'Invalid chat image'; END IF;
  ELSIF p_attachment_mime IS NOT NULL OR p_attachment_bytes IS NOT NULL
    OR p_attachment_width IS NOT NULL OR p_attachment_height IS NOT NULL THEN
    RAISE EXCEPTION 'Incomplete chat image';
  END IF;
  SELECT * INTO target_thread FROM public.chat_threads WHERE id = p_thread_id;
  IF target_thread.thread_type = 'direct' THEN
    receiver := CASE WHEN target_thread.participant_one_id = sender.id THEN target_thread.participant_two_id ELSE target_thread.participant_one_id END;
  END IF;
  INSERT INTO public.employee_chats(thread_id, company_id, sender_id, receiver_id, message,
    attachment_path, attachment_mime, attachment_bytes, attachment_width, attachment_height)
  VALUES (p_thread_id, sender.company_id, sender.id, receiver, clean_message,
    p_attachment_path, p_attachment_mime, p_attachment_bytes, p_attachment_width, p_attachment_height)
  RETURNING * INTO sent;
  UPDATE public.chat_threads SET last_message_id=sent.id,
    last_message_preview=CASE WHEN clean_message='' THEN 'Photo' ELSE left(clean_message,160) END,
    last_message_at=sent.created_at, updated_at=sent.created_at WHERE id=p_thread_id;
  UPDATE public.chat_thread_members SET unread_count=unread_count+1, updated_at=now()
  WHERE thread_id=p_thread_id AND employee_id<>sender.id AND removed_at IS NULL;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_thread_message_v2(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_thread_message_v2(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, INTEGER) TO authenticated;
