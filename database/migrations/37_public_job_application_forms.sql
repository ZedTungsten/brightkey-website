-- Expose only the application form assigned to a posted public job.
-- The complete company-scoped global_settings record remains private.

CREATE OR REPLACE FUNCTION public.get_public_job_application_form(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  instructions TEXT,
  required_qualifications JSONB,
  custom_fields JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(form_config.form ->> 'instructions', '') AS instructions,
    CASE
      WHEN jsonb_typeof(form_config.form -> 'requiredQualifications') = 'array'
        THEN form_config.form -> 'requiredQualifications'
      ELSE '[]'::JSONB
    END AS required_qualifications,
    CASE
      WHEN jsonb_typeof(form_config.form -> 'customFields') = 'array'
        THEN form_config.form -> 'customFields'
      ELSE '[]'::JSONB
    END AS custom_fields
  FROM public.job_posts AS job
  LEFT JOIN public.global_settings AS settings
    ON settings.company_id = job.company_id
    AND settings.key = 'job_application_forms'
  CROSS JOIN LATERAL (
    SELECT COALESCE(settings.value -> job.id::TEXT, '{}'::JSONB) AS form
  ) AS form_config
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job_application_form(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_application_form(UUID, TEXT) TO anon, authenticated;
