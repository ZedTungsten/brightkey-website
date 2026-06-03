-- Migration 25: Create Pricing Tiers for Subscriptions
-- Creates a global pricing_tiers table managed only by johnzeustaller@gmail.com

CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  price_php   INTEGER NOT NULL, -- price per month in PHP
  features    TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone can view tiers
DROP POLICY IF EXISTS "Allow public read pricing_tiers" ON public.pricing_tiers;
CREATE POLICY "Allow public read pricing_tiers" ON public.pricing_tiers
  FOR SELECT USING (true);

-- ALL: only johnzeustaller@gmail.com can manage tiers
DROP POLICY IF EXISTS "Allow johnzeustaller manage pricing_tiers" ON public.pricing_tiers;
CREATE POLICY "Allow johnzeustaller manage pricing_tiers" ON public.pricing_tiers
  FOR ALL USING (
    auth.jwt() ->> 'email' = 'johnzeustaller@gmail.com'
  );

-- Seed initial tiers
INSERT INTO public.pricing_tiers (name, price_php, features) VALUES
  ('eCommerce', 1200, ARRAY['Products', 'Customer Service', 'Logistics']),
  ('eCommerce+', 1500, ARRAY['eCommerce', 'Marketing', 'Sales']),
  ('eCommerce+ Accounting', 2200, ARRAY['All eCommerce+', 'Finance']),
  ('eCommerce+ Enterprise', 2800, ARRAY['All eCommerce+ Accounting', 'HR'])
ON CONFLICT (name) DO UPDATE
SET price_php = EXCLUDED.price_php,
    features = EXCLUDED.features;
