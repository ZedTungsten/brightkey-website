-- Prevent new duplicate applications without deleting historical duplicates.
-- The advisory transaction lock serializes simultaneous submissions for the
-- same job and normalized email, closing the race left by an API-only check.

CREATE INDEX IF NOT EXISTS job_applications_job_normalized_email_idx
  ON public.job_applications (job_post_id, lower(btrim(email)));

CREATE OR REPLACE FUNCTION public.prevent_duplicate_job_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));

  PERFORM pg_advisory_xact_lock(
    hashtextextended(concat(CAST(NEW.job_post_id AS text), '|', NEW.email), 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.job_applications existing
    WHERE existing.job_post_id = NEW.job_post_id
      AND lower(btrim(existing.email)) = NEW.email
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'job_applications_one_email_per_job',
      MESSAGE = 'An application from this email already exists for this job.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_duplicate_job_application() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'prevent_duplicate_job_application_before_insert'
      AND tgrelid = 'public.job_applications'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER prevent_duplicate_job_application_before_insert
      BEFORE INSERT ON public.job_applications
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_duplicate_job_application();
  END IF;
END
$$;
