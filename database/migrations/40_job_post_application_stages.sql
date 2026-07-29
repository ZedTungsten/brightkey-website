ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS application_stages JSONB NOT NULL
  DEFAULT '[{"name":"Stage 1","actions":["","",""]}]'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_application_stages_length'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_application_stages_length
      CHECK (
        jsonb_typeof(application_stages) = 'array'
        AND jsonb_array_length(application_stages) BETWEEN 1 AND 4
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_application_stages_length;
