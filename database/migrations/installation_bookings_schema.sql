-- =============================================================================
-- BrightKey Installation Bookings Schema
-- Stores all customer installation scheduling submissions from order_bookings.html
-- Run this in your Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.installation_bookings (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Reference IDs
  folder_ref_id     text NOT NULL,             -- e.g. DELACRUZ-ORD-20260520-123 (Bunny.net folder)
  order_no          text NOT NULL,             -- e.g. ORD-20260520-123

  -- Customer Info
  customer_name     text NOT NULL,
  customer_social   text,
  customer_email    text,
  customer_phone    text,
  customer_address  text,

  -- Schedule
  scheduled_date    date,
  scheduled_time    text,                       -- 'Morning' | 'Afternoon'

  -- Installer
  installer_id      text,
  installer_name    text,

  -- Products (JSON array of { sku, name, qty })
  products          jsonb DEFAULT '[]'::jsonb,

  -- Door Specs (JSON array of { index, doorMaterial, jambMaterial, photos[] })
  doors             jsonb DEFAULT '[]'::jsonb,

  -- Media CDN URLs
  map_image_url     text,
  frontage_image_url text,
  receipt_pdf_url   text,

  -- Financials snapshot
  subtotal          numeric(10,2),
  charges           numeric(10,2) DEFAULT 0,
  deductions        numeric(10,2) DEFAULT 0,
  grand_total       numeric(10,2),
  deposit_amount    numeric(10,2),
  balance_due       numeric(10,2),

  -- Status
  status            text DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'
  )),

  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now()
);

-- Index for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_installation_bookings_folder_ref ON public.installation_bookings (folder_ref_id);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_date ON public.installation_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_status ON public.installation_bookings (status);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_created ON public.installation_bookings (created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_installation_bookings_updated_at
  BEFORE UPDATE ON public.installation_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Row Level Security
ALTER TABLE public.installation_bookings ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (form submission from browser)
CREATE POLICY "Allow public insert installation_bookings"
  ON public.installation_bookings FOR INSERT WITH CHECK (true);

-- Allow public read (for admin pages using anon key)
CREATE POLICY "Allow public read installation_bookings"
  ON public.installation_bookings FOR SELECT USING (true);

-- Allow public update (e.g. receipt_pdf_url added after PDF save)
CREATE POLICY "Allow public update installation_bookings"
  ON public.installation_bookings FOR UPDATE USING (true);
