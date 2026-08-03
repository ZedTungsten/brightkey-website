-- One-time registration links issued with active hire emails.
CREATE TABLE IF NOT EXISTS public.hiring_directory_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS hiring_directory_registrations_token_idx
  ON public.hiring_directory_registrations (token_hash)
  WHERE used_at IS NULL;

ALTER TABLE public.hiring_directory_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hiring_directory_registrations FROM anon, authenticated;

