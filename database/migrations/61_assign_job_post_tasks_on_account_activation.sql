-- Copy a hired applicant's job-post responsibilities into Team when their
-- Employee Directory record becomes linked to a real Supabase Auth account.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hiring_application_id UUID;

ALTER TABLE public.team_tasks
  ADD COLUMN IF NOT EXISTS source_job_post_id UUID,
  ADD COLUMN IF NOT EXISTS source_responsibility_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_hiring_application_id_fkey'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_hiring_application_id_fkey
      FOREIGN KEY (hiring_application_id)
      REFERENCES public.job_applications(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_tasks_source_job_post_id_fkey'
      AND conrelid = 'public.team_tasks'::regclass
  ) THEN
    ALTER TABLE public.team_tasks
      ADD CONSTRAINT team_tasks_source_job_post_id_fkey
      FOREIGN KEY (source_job_post_id)
      REFERENCES public.job_posts(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS team_tasks_hiring_source_uidx
  ON public.team_tasks (assigned_to, source_job_post_id, source_responsibility_key)
  WHERE source_job_post_id IS NOT NULL
    AND source_responsibility_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_hiring_application_id_idx
  ON public.employees (hiring_application_id)
  WHERE hiring_application_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_hiring_responsibilities_to_employee(
  p_employee_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_record public.employees%ROWTYPE;
  application_record public.job_applications%ROWTYPE;
  job_record public.job_posts%ROWTYPE;
  assigner_id UUID;
  inserted_count INTEGER := 0;
BEGIN
  SELECT * INTO employee_record
  FROM public.employees
  WHERE id = p_employee_id;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = employee_record.id
  ) THEN
    RETURN 0;
  END IF;

  IF employee_record.hiring_application_id IS NOT NULL THEN
    SELECT * INTO application_record
    FROM public.job_applications
    WHERE id = employee_record.hiring_application_id
      AND company_id = employee_record.company_id
      AND status = 'approved'
      AND hired_at IS NOT NULL;
  END IF;

  IF application_record.id IS NULL THEN
    SELECT application.* INTO application_record
    FROM public.job_applications application
    WHERE application.company_id = employee_record.company_id
      AND application.status = 'approved'
      AND application.hired_at IS NOT NULL
      AND (
        lower(btrim(application.email)) = lower(btrim(employee_record.email))
        OR (
          lower(regexp_replace(application.first_name, '\s+', '', 'g')) = lower(regexp_replace(employee_record.first_name, '\s+', '', 'g'))
          AND lower(regexp_replace(application.last_name, '\s+', '', 'g')) = lower(regexp_replace(employee_record.last_name, '\s+', '', 'g'))
        )
      )
    ORDER BY
      CASE WHEN lower(btrim(application.email)) = lower(btrim(employee_record.email)) THEN 0 ELSE 1 END,
      application.hired_at DESC,
      application.submitted_at DESC
    LIMIT 1;
  END IF;

  IF application_record.id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.employees
  SET hiring_application_id = application_record.id
  WHERE id = employee_record.id
    AND hiring_application_id IS DISTINCT FROM application_record.id;

  SELECT * INTO job_record
  FROM public.job_posts
  WHERE id = application_record.job_post_id
    AND company_id = employee_record.company_id;

  IF job_record.id IS NULL THEN
    RETURN 0;
  END IF;

  assigner_id := job_record.created_by;
  IF assigner_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = assigner_id) THEN
    SELECT member.user_id INTO assigner_id
    FROM public.companies company
    JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
    WHERE company.id = employee_record.company_id
      AND member.role IN ('owner', 'admin')
    ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF assigner_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH responsibility_rows AS (
    SELECT 'daily'::TEXT AS task_type, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'daily', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
    UNION ALL
    SELECT 'weekly'::TEXT, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'weekly', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
    UNION ALL
    SELECT 'monthly'::TEXT, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'monthly', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
  ), normalized_rows AS (
    SELECT
      task_type,
      ordinality,
      CASE
        WHEN jsonb_typeof(item) = 'object' THEN btrim(item->>'item')
        ELSE btrim(item #>> '{}')
      END AS title,
      CASE WHEN jsonb_typeof(item) = 'object' THEN NULLIF(btrim(item->>'kpi'), '') END AS kpi
    FROM responsibility_rows
  )
  INSERT INTO public.team_tasks (
    company_id,
    assigned_to,
    assigned_by,
    title,
    description,
    kpi,
    task_type,
    source_job_post_id,
    source_responsibility_key
  )
  SELECT
    employee_record.company_id,
    employee_record.id,
    assigner_id,
    title,
    NULL,
    kpi,
    task_type,
    job_record.id,
    concat(task_type, ':', ordinality)
  FROM normalized_rows
  WHERE title IS NOT NULL AND title <> ''
  ON CONFLICT (assigned_to, source_job_post_id, source_responsibility_key)
    WHERE source_job_post_id IS NOT NULL AND source_responsibility_key IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hiring_responsibilities_to_employee(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assign_hiring_responsibilities_after_employee_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assign_hiring_responsibilities_to_employee(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hiring_responsibilities_after_employee_link() FROM PUBLIC;

DROP TRIGGER IF EXISTS assign_hiring_responsibilities_after_employee_link ON public.employees;
CREATE TRIGGER assign_hiring_responsibilities_after_employee_link
  AFTER INSERT OR UPDATE OF id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_hiring_responsibilities_after_employee_link();

-- Backfill already-created accounts. The function is idempotent and inserts
-- only responsibilities that retain a unique job-post source key.
DO $$
DECLARE
  employee_id UUID;
BEGIN
  FOR employee_id IN
    SELECT employee.id
    FROM public.employees employee
    JOIN auth.users auth_user ON auth_user.id = employee.id
  LOOP
    PERFORM public.assign_hiring_responsibilities_to_employee(employee_id);
  END LOOP;
END
$$;
