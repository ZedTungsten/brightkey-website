-- =============================================================================
-- BrightKey Consolidated Marketing Schema (05_marketing.sql)
-- Consolidates marketing audience and email marketing campaign tables.
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables if they exist
DROP TABLE IF EXISTS public.email_marketing_audience_members CASCADE;
DROP TABLE IF EXISTS public.email_marketing_audiences CASCADE;
DROP TABLE IF EXISTS public.marketing_audience CASCADE;

-- ── 1. Marketing Audience Table (Legacy/Promo Popup) ────────────────────────
CREATE TABLE public.marketing_audience (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  email               TEXT UNIQUE NOT NULL,
  source              TEXT NOT NULL DEFAULT 'promo_popup',
  first_name          TEXT,
  last_name           TEXT,
  phone               TEXT,
  country             TEXT DEFAULT 'Philippines',
  address             TEXT,
  city                TEXT,
  zip_code            TEXT,
  audience            TEXT DEFAULT 'Customer',
  value               TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. Email Marketing Audiences Table ───────────────────────────────────────
CREATE TABLE public.email_marketing_audiences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 3. Email Marketing Audience Members Table ───────────────────────────────
CREATE TABLE public.email_marketing_audience_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  audience_id   UUID REFERENCES public.email_marketing_audiences(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'promo_popup',
  first_name    TEXT,
  last_name     TEXT,
  phone         TEXT,
  city          TEXT,
  address       TEXT,
  zip_code      TEXT,
  country       TEXT DEFAULT 'Philippines',
  is_subscribed BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_audience_email UNIQUE (audience_id, email)
);

-- ── Row Level Security Policies ──────────────────────────────────────────────

ALTER TABLE public.marketing_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_marketing_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_marketing_audience_members ENABLE ROW LEVEL SECURITY;

-- Marketing Audience Policies (Legacy)
CREATE POLICY "Allow public insert" ON public.marketing_audience FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.marketing_audience FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.marketing_audience FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read/write" ON public.marketing_audience FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Email Marketing Audiences Policies
CREATE POLICY "Allow company audience select" ON public.email_marketing_audiences
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company audience write" ON public.email_marketing_audiences
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Email Marketing Audience Members Policies
CREATE POLICY "Allow public insert on members" ON public.email_marketing_audience_members 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on members" ON public.email_marketing_audience_members 
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public select on members" ON public.email_marketing_audience_members 
  FOR SELECT USING (true);

CREATE POLICY "Company staff audience members access" ON public.email_marketing_audience_members
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Seed default audiences (general and checkout signups)
-- Note: Seeding is not company-scoped by default, but let's insert if they don't conflict
INSERT INTO public.email_marketing_audiences (name, description) VALUES
('Customer', 'Default general contact audience.'),
('Checkout Signups', 'Customers who subscribed to marketing emails during checkout.')
ON CONFLICT (name) DO NOTHING;
