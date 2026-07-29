UPDATE public.job_posts
SET application_stages = '[
  {"name":"Stage 1","actions":[""]},
  {"name":"Stage 2","actions":[""]},
  {"name":"Stage 3","actions":[""]}
]'::JSONB
WHERE application_stages = '[
  {"name":"Stage 1","actions":["","",""]}
]'::JSONB;
