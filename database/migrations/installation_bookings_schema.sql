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

  -- Products (pipe-separated strings for easy receipt re-rendering)
  -- Example: product_skus = "B11 | A04"
  --          product_names = "Smart Lock Pro | Deadbolt Set"
  --          product_qtys  = "1 | 2"
  --          product_unit_prices = "2499.00 | 5499.00"
  --          product_totals      = "2499.00 | 10998.00"
  product_skus        text,
  product_names       text,
  product_qtys        text,
  product_unit_prices text,
  product_totals      text,

  -- Full product data (JSON for programmatic access)
  products          jsonb DEFAULT '[]'::jsonb,

  -- Charges / Others (pipe-separated)
  -- Example: charge_labels = "Credit card fee | Shipping fee"
  --          charge_values  = "900.00 | 1850.00"
  charge_labels     text,
  charge_values     text,

  -- Deductions / Less (pipe-separated)
  -- Example: deduction_labels = "Senior discount | Promo"
  --          deduction_values  = "500.00 | 250.00"
  deduction_labels  text,
  deduction_values  text,

  -- Door Specs (JSON array of { index, doorMaterial, jambMaterial, photos[] })
  doors             jsonb DEFAULT '[]'::jsonb,

  -- All uploaded image CDN URLs (Bunny.net)
  map_image_url       text,
  frontage_image_url  text,
  door_photo_urls     text,   -- pipe-separated: "https://cdn.../d1p1.jpg | https://cdn.../d1p2.jpg | ..."
  receipt_pdf_url     text,

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

DROP TRIGGER IF EXISTS set_installation_bookings_updated_at ON public.installation_bookings;
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
