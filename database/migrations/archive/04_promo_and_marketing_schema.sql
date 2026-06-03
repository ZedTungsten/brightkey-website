-- =============================================================================
-- BrightKey Consolidated Promo and Marketing Schema (04_promo_and_marketing_schema.sql)
-- Consolidates global settings, coupons, and marketing audience
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables if they exist
DROP TABLE IF EXISTS public.marketing_audience CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.global_settings CASCADE;

-- ── 1. Global Settings ───────────────────────────────────────────────────────
CREATE TABLE public.global_settings (
  key                 TEXT PRIMARY KEY,
  value               JSONB NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Settings
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read for settings" ON public.global_settings FOR SELECT USING (true);
CREATE POLICY "Allow all write for settings" ON public.global_settings FOR ALL USING (true);

-- Seed default settings
INSERT INTO public.global_settings (key, value) VALUES 
('free_shipping', '{"threshold": 500000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.global_settings (key, value) VALUES 
('announcement_bar', '{"active": false, "text": "🔥 Limited Time Offer! Get 10% off! ⏰", "bg_color": "#dc2626", "text_color": "#ffffff", "countdown_minutes": 15, "countdown_seconds": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 2. Coupons ───────────────────────────────────────────────────────────────
CREATE TABLE public.coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value      NUMERIC NOT NULL,
  start_date          TIMESTAMP WITH TIME ZONE,
  end_date            TIMESTAMP WITH TIME ZONE,
  applicable_businesses TEXT[] DEFAULT '{}'::TEXT[],
  applicable_categories TEXT[] DEFAULT '{}'::TEXT[],
  applicable_skus     TEXT[] DEFAULT '{}'::TEXT[],
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read for coupons" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "Allow all write for coupons" ON public.coupons FOR ALL USING (true);

-- ── 3. Marketing Audience ────────────────────────────────────────────────────
CREATE TABLE public.marketing_audience (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- RLS Marketing Audience
ALTER TABLE public.marketing_audience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert" ON public.marketing_audience FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.marketing_audience FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.marketing_audience FOR SELECT USING (true);
CREATE POLICY "Allow authenticated read/write" ON public.marketing_audience FOR ALL TO authenticated USING (true) WITH CHECK (true);
