-- =============================================================================
-- BrightKey Installation Bookings Schema (v2 — safe incremental update)
-- Run this in your Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS and DROP IF EXISTS throughout.
-- =============================================================================

-- Create the table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.installation_bookings (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_ref_id     text NOT NULL,
  order_no          text NOT NULL,
  customer_name     text NOT NULL,
  customer_social   text,
  customer_email    text,
  customer_phone    text,
  customer_address  text,
  scheduled_date    date,
  scheduled_time    text,
  installer_id      text,
  installer_name    text,
  products          jsonb DEFAULT '[]'::jsonb,
  doors             jsonb DEFAULT '[]'::jsonb,
  map_image_url     text,
  frontage_image_url text,
  receipt_pdf_url   text,
  subtotal          numeric(10,2),
  charges           numeric(10,2) DEFAULT 0,
  deductions        numeric(10,2) DEFAULT 0,
  grand_total       numeric(10,2),
  deposit_amount    numeric(10,2),
  balance_due       numeric(10,2),
  status            text DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'
  )),
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now()
);

-- Add new columns if they don't exist yet (safe to run multiple times)
ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS product_skus        text,
  ADD COLUMN IF NOT EXISTS product_names       text,
  ADD COLUMN IF NOT EXISTS product_qtys        text,
  ADD COLUMN IF NOT EXISTS product_unit_prices text,
  ADD COLUMN IF NOT EXISTS product_totals      text,
  ADD COLUMN IF NOT EXISTS charge_labels       text,
  ADD COLUMN IF NOT EXISTS charge_values       text,
  ADD COLUMN IF NOT EXISTS deduction_labels    text,
  ADD COLUMN IF NOT EXISTS deduction_values    text,
  ADD COLUMN IF NOT EXISTS door_photo_urls     text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_installation_bookings_folder_ref ON public.installation_bookings (folder_ref_id);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_date ON public.installation_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_status ON public.installation_bookings (status);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_created ON public.installation_bookings (created_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_installation_bookings_updated_at ON public.installation_bookings;
CREATE TRIGGER set_installation_bookings_updated_at
  BEFORE UPDATE ON public.installation_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Row Level Security
ALTER TABLE public.installation_bookings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (safe re-run)
DROP POLICY IF EXISTS "Allow public insert installation_bookings" ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public read installation_bookings"   ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public update installation_bookings" ON public.installation_bookings;

CREATE POLICY "Allow public insert installation_bookings"
  ON public.installation_bookings FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read installation_bookings"
  ON public.installation_bookings FOR SELECT USING (true);

CREATE POLICY "Allow public update installation_bookings"
  ON public.installation_bookings FOR UPDATE USING (true);
