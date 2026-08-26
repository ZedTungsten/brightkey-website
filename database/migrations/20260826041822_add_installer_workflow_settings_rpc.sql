CREATE OR REPLACE FUNCTION public.get_installer_workflow_settings(p_token UUID)
RETURNS TABLE (
  company_id UUID,
  booking_checklist JSON,
  booking_media_requirements JSON
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    session.company_id,
    checklist.value AS booking_checklist,
    media.value AS booking_media_requirements
  FROM public.installer_sessions AS session
  LEFT JOIN public.global_settings AS checklist
    ON checklist.company_id = session.company_id
   AND checklist.key = 'booking_checklist'
  LEFT JOIN public.global_settings AS media
    ON media.company_id = session.company_id
   AND media.key = 'booking_media_requirements'
  WHERE session.token = p_token
    AND session.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_installer_workflow_settings(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_workflow_settings(UUID) TO anon;
