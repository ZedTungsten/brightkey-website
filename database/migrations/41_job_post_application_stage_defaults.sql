ALTER TABLE public.job_posts
  ALTER COLUMN application_stages SET DEFAULT
  '[
    {"name":"Stage 1","actions":[""]},
    {"name":"Stage 2","actions":[""]},
    {"name":"Stage 3","actions":[""]}
  ]'::JSONB;
