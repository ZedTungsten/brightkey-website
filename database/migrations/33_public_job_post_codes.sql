-- Stable public job URLs and narrow read-only access for posted vacancies.

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS public_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_job_post_public_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
BEGIN
  LOOP
    v_code := translate(
      rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='),
      '+/',
      '-_'
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.job_posts
      WHERE public_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

DO $$
DECLARE
  v_job_id UUID;
BEGIN
  FOR v_job_id IN
    SELECT id
    FROM public.job_posts
    WHERE public_code IS NULL OR public_code = ''
  LOOP
    UPDATE public.job_posts
    SET public_code = public.generate_job_post_public_code()
    WHERE id = v_job_id;
  END LOOP;
END;
$$;

ALTER TABLE public.job_posts
  ALTER COLUMN public_code SET DEFAULT public.generate_job_post_public_code();

ALTER TABLE public.job_posts
  ALTER COLUMN public_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_posts_public_code_uidx
  ON public.job_posts (public_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_public_code_format'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_public_code_format
      CHECK (public_code ~ '^[A-Za-z0-9_-]+$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_job_posts(p_company_id UUID)
RETURNS TABLE (
  public_code TEXT,
  job_title TEXT,
  job_description TEXT,
  employment_type TEXT,
  department_name TEXT,
  team_name TEXT,
  reporting_mode TEXT,
  location_scope TEXT,
  location_country TEXT,
  location_city TEXT,
  expertise_level TEXT,
  vacancy_count INTEGER,
  expected_start_date DATE,
  tags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.public_code,
    job.job_title::TEXT,
    job.job_description::TEXT,
    job.employment_type,
    job.department_name,
    job.team_name,
    job.reporting_mode,
    job.location_scope,
    job.location_country,
    job.location_city,
    job.expertise_level,
    job.vacancy_count,
    job.expected_start_date,
    job.tags,
    job.created_at
  FROM public.job_posts job
  WHERE job.company_id = p_company_id
    AND job.status = 'posted'
  ORDER BY job.created_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_public_job_post(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  public_code TEXT,
  employment_type TEXT,
  position_name TEXT,
  department_name TEXT,
  team_name TEXT,
  position_type TEXT,
  job_title TEXT,
  job_description TEXT,
  qualifications JSONB,
  responsibilities JSONB,
  milestones JSONB,
  project_length TEXT,
  fixed_price NUMERIC,
  monthly_salary NUMERIC,
  salary_confidential BOOLEAN,
  salary_negotiable BOOLEAN,
  compensation_extras TEXT[],
  benefits TEXT[],
  reporting_days TEXT[],
  reporting_time_start TIME,
  reporting_time_end TIME,
  free_hours BOOLEAN,
  reporting_mode TEXT,
  location_scope TEXT,
  location_country TEXT,
  location_city TEXT,
  applicant_type TEXT,
  expertise_level TEXT,
  vacancy_count INTEGER,
  expected_start_date DATE,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.public_code,
    job.employment_type,
    job.position,
    job.department_name,
    job.team_name,
    job.position_type,
    job.job_title::TEXT,
    job.job_description::TEXT,
    job.qualifications,
    job.responsibilities,
    job.milestones,
    job.project_length,
    job.fixed_price,
    job.monthly_salary,
    job.salary_confidential,
    job.salary_negotiable,
    job.compensation_extras,
    job.benefits,
    job.reporting_days,
    job.reporting_time_start,
    job.reporting_time_end,
    job.free_hours,
    job.reporting_mode,
    job.location_scope,
    job.location_country,
    job.location_city,
    job.applicant_type,
    job.expertise_level,
    job.vacancy_count,
    job.expected_start_date,
    job.tags,
    job.created_at,
    job.updated_at
  FROM public.job_posts job
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.generate_job_post_public_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_job_posts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_job_post(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_job_posts(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_job_post(UUID, TEXT) TO anon, authenticated;
