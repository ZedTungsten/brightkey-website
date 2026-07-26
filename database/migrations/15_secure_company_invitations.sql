ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_invitations_tenant_email
  ON public.company_invitations (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_company_invitations_token_hash
  ON public.company_invitations (token_hash)
  WHERE token_hash IS NOT NULL AND used_at IS NULL;
