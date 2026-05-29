-- Migration: Create Email Marketing Audience and Members tables for the future Email Marketing system.
CREATE TABLE IF NOT EXISTS public.email_marketing_audiences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_marketing_audience_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Enable RLS
ALTER TABLE public.email_marketing_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_marketing_audience_members ENABLE ROW LEVEL SECURITY;

-- Policies for public.email_marketing_audiences
DROP POLICY IF EXISTS "Allow public select on audiences" ON public.email_marketing_audiences;
DROP POLICY IF EXISTS "Allow all write on audiences" ON public.email_marketing_audiences;
CREATE POLICY "Allow public select on audiences" ON public.email_marketing_audiences FOR SELECT USING (true);
CREATE POLICY "Allow all write on audiences" ON public.email_marketing_audiences FOR ALL USING (true);

-- Policies for public.email_marketing_audience_members
DROP POLICY IF EXISTS "Allow public insert on members" ON public.email_marketing_audience_members;
DROP POLICY IF EXISTS "Allow public update on members" ON public.email_marketing_audience_members;
DROP POLICY IF EXISTS "Allow public select on members" ON public.email_marketing_audience_members;
CREATE POLICY "Allow public insert on members" ON public.email_marketing_audience_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on members" ON public.email_marketing_audience_members FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public select on members" ON public.email_marketing_audience_members FOR SELECT USING (true);

-- Seed default settings
INSERT INTO public.email_marketing_audiences (name, description) VALUES
('Customer', 'Default general contact audience.'),
('Checkout Signups', 'Customers who subscribed to marketing emails during checkout.')
ON CONFLICT (name) DO NOTHING;
