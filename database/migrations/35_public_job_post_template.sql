-- Expose only the approved, public-facing job header image configuration.
-- This keeps the rest of the hiring template configuration private.

CREATE OR REPLACE FUNCTION public.get_public_job_post_template(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  header_image_url TEXT,
  header_image_position_y INTEGER,
  header_image_zoom INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NULLIF(settings.value -> job.id::TEXT ->> 'headerImageUrl', '') AS header_image_url,
    LEAST(100, GREATEST(0, COALESCE((settings.value -> job.id::TEXT ->> 'positionY')::INTEGER, 50)))
      AS header_image_position_y,
    LEAST(200, GREATEST(100, COALESCE((settings.value -> job.id::TEXT ->> 'zoom')::INTEGER, 100)))
      AS header_image_zoom
  FROM public.job_posts AS job
  LEFT JOIN public.global_settings AS settings
    ON settings.company_id = job.company_id
    AND settings.key = 'job_post_template_config'
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job_post_template(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_post_template(UUID, TEXT) TO anon, authenticated;
