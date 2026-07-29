-- Track each applicant's progress through the job post's configured stages.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS current_stage INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS stage_history JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS hired_at TIMESTAMPTZ;

UPDATE public.job_applications
SET current_stage = 1
WHERE current_stage IS NULL;

UPDATE public.job_applications
SET stage_history = '[]'::JSONB
WHERE stage_history IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_current_stage_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_current_stage_check
      CHECK (current_stage BETWEEN 1 AND 4) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_stage_history_array_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_stage_history_array_check
      CHECK (jsonb_typeof(stage_history) = 'array') NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_current_stage_check;

ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_stage_history_array_check;

CREATE INDEX IF NOT EXISTS job_applications_company_job_stage_submitted_idx
  ON public.job_applications (company_id, job_post_id, current_stage, submitted_at DESC);
