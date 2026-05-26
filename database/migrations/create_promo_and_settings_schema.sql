-- Migration: Create Global Settings and Coupon Codes Schema

-- Table for key-value configurations (Free Shipping, Announcement Bar, etc.)
CREATE TABLE IF NOT EXISTS public.global_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for Coupon Codes
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  applicable_businesses TEXT[] DEFAULT '{}'::TEXT[],
  applicable_categories TEXT[] DEFAULT '{}'::TEXT[],
  applicable_skus TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS and insert default seed config for global settings
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Simple policies (allow all read/write for now to match the admin dashboard style)
CREATE POLICY "Allow public read for settings" ON public.global_settings FOR SELECT USING (true);
CREATE POLICY "Allow all write for settings" ON public.global_settings FOR ALL USING (true);

CREATE POLICY "Allow public read for coupons" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "Allow all write for coupons" ON public.coupons FOR ALL USING (true);

-- Seed default settings if not exists
INSERT INTO public.global_settings (key, value) VALUES 
('free_shipping', '{"threshold": 500000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.global_settings (key, value) VALUES 
('announcement_bar', '{"active": false, "text": "🔥 Limited Time Offer! Get 10% off! ⏰", "bg_color": "#dc2626", "text_color": "#ffffff", "countdown_minutes": 15, "countdown_seconds": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;
