-- Expand the shared employee/job hierarchy from levels 1-4 to levels 1-7.
-- Existing job posts remain valid and no employee or job data is rewritten.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT constraint_name
    FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.job_posts'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%visibility_level%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.job_posts DROP CONSTRAINT %I',
      constraint_record.constraint_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_visibility_level_range'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_visibility_level_range
      CHECK (visibility_level IS NULL OR visibility_level BETWEEN 1 AND 7)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_visibility_level_range;
