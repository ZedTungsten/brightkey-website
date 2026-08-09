CREATE OR REPLACE FUNCTION public.get_installer_notes(p_token UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content_html TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT note.id, note.title, note.content_html, note.updated_at
  FROM public.installer_sessions AS session
  JOIN public.installer_notes AS note
    ON note.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
  ORDER BY note.updated_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_installer_notes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_notes(UUID) TO anon;
