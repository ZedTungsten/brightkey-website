-- Persist public careers applications while keeping applicant data private to HR.

CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  job_public_code TEXT NOT NULL,
  job_title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  certified_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_post_id UUID REFERENCES public.job_posts(id) ON DELETE CASCADE;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_public_code TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_status_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_status_check
      CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_answers_array_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_answers_array_check
      CHECK (jsonb_typeof(answers) = 'array') NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_status_check;
ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_answers_array_check;

CREATE INDEX IF NOT EXISTS job_applications_company_job_submitted_idx
  ON public.job_applications (company_id, job_post_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS job_applications_company_status_idx
  ON public.job_applications (company_id, status);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-internal',
  'brightkey-internal',
  FALSE,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_applications'
      AND policyname = 'HR can read job applications'
  ) THEN
    CREATE POLICY "HR can read job applications"
      ON public.job_applications
      FOR SELECT
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'HR'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_applications'
      AND policyname = 'HR can update job applications'
  ) THEN
    CREATE POLICY "HR can update job applications"
      ON public.job_applications
      FOR UPDATE
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'HR'))
      WITH CHECK (public.has_module_access((SELECT auth.uid()), company_id, 'HR'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_job_application_summary(p_company_id UUID)
RETURNS TABLE (
  job_post_id UUID,
  job_public_code TEXT,
  job_title TEXT,
  total_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT,
  pending_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_module_access((SELECT auth.uid()), p_company_id, 'HR') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    job.id,
    job.public_code::TEXT,
    job.job_title::TEXT,
    COUNT(application.id),
    COUNT(application.id) FILTER (WHERE application.status = 'approved'),
    COUNT(application.id) FILTER (WHERE application.status = 'rejected'),
    COUNT(application.id) FILTER (WHERE application.status = 'pending')
  FROM public.job_posts AS job
  LEFT JOIN public.job_applications AS application
    ON application.company_id = job.company_id
    AND application.job_post_id = job.id
  WHERE job.company_id = p_company_id
  GROUP BY job.id, job.public_code, job.job_title, job.created_at
  ORDER BY job.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_application_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_application_summary(UUID) TO authenticated;
