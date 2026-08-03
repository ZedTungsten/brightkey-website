-- Close public job posts as soon as approved hires fill every vacancy.
CREATE OR REPLACE FUNCTION public.close_fully_staffed_job_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.hired_at IS NOT NULL THEN
    UPDATE public.job_posts job
    SET status = 'closed', updated_at = NOW()
    WHERE job.id = NEW.job_post_id
      AND job.company_id = NEW.company_id
      AND job.status = 'posted'
      AND (
        SELECT COUNT(*)
        FROM public.job_applications application
        WHERE application.job_post_id = job.id
          AND application.company_id = job.company_id
          AND application.status = 'approved'
          AND application.hired_at IS NOT NULL
      ) >= GREATEST(1, job.vacancy_count);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_fully_staffed_job_post_after_hire ON public.job_applications;
CREATE TRIGGER close_fully_staffed_job_post_after_hire
AFTER INSERT OR UPDATE OF status, hired_at ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.close_fully_staffed_job_post();

-- Prevent an edit from republishing a job whose vacancies are still full.
CREATE OR REPLACE FUNCTION public.enforce_job_post_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'posted' AND (
    SELECT COUNT(*)
    FROM public.job_applications application
    WHERE application.job_post_id = NEW.id
      AND application.company_id = NEW.company_id
      AND application.status = 'approved'
      AND application.hired_at IS NOT NULL
  ) >= GREATEST(1, NEW.vacancy_count) THEN
    NEW.status := 'closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_job_post_capacity_before_publish ON public.job_posts;
CREATE TRIGGER enforce_job_post_capacity_before_publish
BEFORE INSERT OR UPDATE OF vacancy_count, status ON public.job_posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_job_post_capacity();

-- Keep a filled direct link readable while public listings continue to show
-- only status = 'posted'. The returned shape remains backward-compatible.
CREATE OR REPLACE FUNCTION public.get_public_job_post(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  public_code TEXT, employment_type TEXT, position_name TEXT, department_name TEXT,
  team_name TEXT, position_type TEXT, job_title TEXT, job_description TEXT,
  qualifications JSONB, responsibilities JSONB, milestones JSONB,
  project_length TEXT, fixed_price NUMERIC, monthly_salary NUMERIC,
  salary_confidential BOOLEAN, salary_negotiable BOOLEAN,
  compensation_extras TEXT[], benefits TEXT[], reporting_days TEXT[],
  reporting_time_start TIME, reporting_time_end TIME, free_hours BOOLEAN,
  reporting_mode TEXT, location_scope TEXT, location_country TEXT,
  location_city TEXT, applicant_type TEXT, expertise_level TEXT,
  vacancy_count INTEGER, expected_start_date DATE, tags TEXT[],
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.public_code, job.employment_type, job.position, job.department_name,
    job.team_name, job.position_type, job.job_title::TEXT,
    job.job_description::TEXT, job.qualifications, job.responsibilities,
    job.milestones, job.project_length, job.fixed_price, job.monthly_salary,
    job.salary_confidential, job.salary_negotiable, job.compensation_extras,
    job.benefits, job.reporting_days, job.reporting_time_start,
    job.reporting_time_end, job.free_hours, job.reporting_mode,
    job.location_scope, job.location_country, job.location_city,
    job.applicant_type, job.expertise_level, job.vacancy_count,
    job.expected_start_date, job.tags, job.created_at, job.updated_at
  FROM public.job_posts job
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND (
      job.status = 'posted'
      OR (job.status = 'closed' AND (
        SELECT COUNT(*) FROM public.job_applications application
        WHERE application.job_post_id = job.id
          AND application.company_id = job.company_id
          AND application.status = 'approved'
          AND application.hired_at IS NOT NULL
      ) >= GREATEST(1, job.vacancy_count))
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_public_job_fully_staffed(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_posts job
    WHERE job.company_id = p_company_id
      AND job.public_code = p_public_code
      AND job.status = 'closed'
      AND (
        SELECT COUNT(*) FROM public.job_applications application
        WHERE application.job_post_id = job.id
          AND application.company_id = job.company_id
          AND application.status = 'approved'
          AND application.hired_at IS NOT NULL
      ) >= GREATEST(1, job.vacancy_count)
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_job_fully_staffed(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_job_fully_staffed(UUID, TEXT) TO anon, authenticated;

UPDATE public.job_posts job
SET status = 'closed', updated_at = NOW()
WHERE job.status = 'posted'
  AND (
    SELECT COUNT(*)
    FROM public.job_applications application
    WHERE application.job_post_id = job.id
      AND application.company_id = job.company_id
      AND application.status = 'approved'
      AND application.hired_at IS NOT NULL
  ) >= GREATEST(1, job.vacancy_count);
