-- Compact public job URLs: exactly five URL-safe characters.
-- Existing codes are regenerated before the stricter constraint is validated.

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
    v_code := substring(translate(
      rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='),
      '+/',
      '-_'
    ) FROM 1 FOR 5);

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.job_posts
      WHERE public_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

ALTER TABLE public.job_posts
  ALTER COLUMN public_code SET DEFAULT public.generate_job_post_public_code();

DO $$
DECLARE
  v_job_id UUID;
BEGIN
  FOR v_job_id IN
    SELECT id
    FROM public.job_posts
    WHERE public_code !~ '^[A-Za-z0-9_-]{5}$'
  LOOP
    UPDATE public.job_posts
    SET public_code = public.generate_job_post_public_code()
    WHERE id = v_job_id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_public_code_compact_format'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_public_code_compact_format
      CHECK (public_code ~ '^[A-Za-z0-9_-]{5}$') NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_public_code_compact_format;
