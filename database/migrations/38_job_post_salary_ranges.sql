-- Optional monthly salary ranges for regular job posts.

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS salary_mode TEXT NOT NULL DEFAULT 'single';

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS monthly_salary_max NUMERIC(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_salary_mode_check'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_salary_mode_check
      CHECK (salary_mode IN ('single', 'range')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_monthly_salary_max_check'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_monthly_salary_max_check
      CHECK (
        monthly_salary_max IS NULL
        OR (
          monthly_salary_max >= 0
          AND (monthly_salary IS NULL OR monthly_salary_max >= monthly_salary)
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_salary_mode_check;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_monthly_salary_max_check;

CREATE OR REPLACE FUNCTION public.get_public_job_salary_range(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  salary_mode TEXT,
  monthly_salary_max NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.salary_mode,
    job.monthly_salary_max
  FROM public.job_posts AS job
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job_salary_range(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_salary_range(UUID, TEXT) TO anon, authenticated;
