-- Connect Employee Directory records directly to the job post that defines
-- their responsibilities, forms, and contract context.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS job_post_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_job_post_id_fkey'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_job_post_id_fkey
      FOREIGN KEY (job_post_id)
      REFERENCES public.job_posts(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS employees_company_job_post_idx
  ON public.employees (company_id, job_post_id)
  WHERE job_post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_employee_job_post_responsibilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job_record public.job_posts%ROWTYPE;
  assigner_id UUID;
BEGIN
  IF NEW.job_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.job_post_id IS NOT DISTINCT FROM OLD.job_post_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO job_record
  FROM public.job_posts
  WHERE id = NEW.job_post_id
    AND company_id = NEW.company_id;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION 'The selected job post does not belong to this employee company.';
  END IF;

  assigner_id := job_record.created_by;
  IF assigner_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = assigner_id) THEN
    SELECT member.user_id INTO assigner_id
    FROM public.companies company
    JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
    WHERE company.id = NEW.company_id
      AND member.role IN ('owner', 'admin')
    ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF assigner_id IS NULL THEN
    RETURN NEW;
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
      CASE WHEN jsonb_typeof(item) = 'object' THEN btrim(item->>'item') ELSE btrim(item #>> '{}') END AS title,
      CASE WHEN jsonb_typeof(item) = 'object' THEN NULLIF(btrim(item->>'kpi'), '') END AS kpi
    FROM responsibility_rows
  )
  INSERT INTO public.team_tasks (
    company_id, assigned_to, assigned_by, title, description, kpi,
    task_type, source_job_post_id, source_responsibility_key
  )
  SELECT
    NEW.company_id, NEW.id, assigner_id, title, NULL, kpi,
    task_type, job_record.id, concat(task_type, ':', ordinality)
  FROM normalized_rows
  WHERE title IS NOT NULL AND title <> ''
  ON CONFLICT (assigned_to, source_job_post_id, source_responsibility_key)
    WHERE source_job_post_id IS NOT NULL AND source_responsibility_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_job_post_responsibilities() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_employee_job_post_responsibilities ON public.employees;
CREATE TRIGGER sync_employee_job_post_responsibilities
  AFTER INSERT OR UPDATE OF job_post_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_job_post_responsibilities();
