-- =============================================================================
-- BrightKey Consolidated Company Integrations Schema (08_company_integrations.sql)
-- Consolidates Paymongo and Stripe integration credentials, RLS policies, and views.
-- =============================================================================

DROP VIEW IF EXISTS public.view_public_integrations CASCADE;
DROP TABLE IF EXISTS public.company_integrations CASCADE;

-- ── 1. Company Integrations Table ─────────────────────────────────────────────
CREATE TABLE public.company_integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  paymongo_public_key  TEXT,
  paymongo_secret_key  TEXT,
  stripe_public_key    TEXT,
  stripe_secret_key    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.company_integrations ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies ensuring only authorized company members can read or edit integrations
CREATE POLICY "Allow company members read integrations" ON public.company_integrations
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members write integrations" ON public.company_integrations
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at column
CREATE OR REPLACE TRIGGER trg_company_integrations_updated_at
  BEFORE UPDATE ON public.company_integrations
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

-- ── 2. Public Integrations View ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.view_public_integrations AS
SELECT 
  company_id, 
  (paymongo_public_key IS NOT NULL AND paymongo_secret_key IS NOT NULL) AS paymongo_configured, 
  (stripe_public_key IS NOT NULL AND stripe_secret_key IS NOT NULL) AS stripe_configured,
  paymongo_public_key,
  stripe_public_key
FROM public.company_integrations;

GRANT SELECT ON public.view_public_integrations TO anon, authenticated;
