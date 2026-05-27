-- =============================================================================
-- BrightKey Consolidated Ecommerce Schema (01_ecommerce_schema.sql)
-- Consolidates products, features, reviews, and profiles
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS public.customer_profiles CASCADE;
DROP TABLE IF EXISTS public.product_reviews CASCADE;
DROP TABLE IF EXISTS public.smartlock_features CASCADE;
DROP TABLE IF EXISTS public.solarpower_features CASCADE;
DROP TABLE IF EXISTS public.cctv_features CASCADE;
DROP TABLE IF EXISTS public.fireextinguisher_features CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;

-- ── 1. Products Table ────────────────────────────────────────────────────────
CREATE TABLE public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                 TEXT UNIQUE NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  business            TEXT NOT NULL CHECK (business IN ('smart_lock','solar_power','cctv','fire_extinguisher')),
  category            TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  
  -- Variant grouping
  parent_sku          TEXT,
  variant_name        TEXT,
  variant_value       TEXT,
  
  -- Cross-sells / recommendations
  related_skus        TEXT[],
  
  -- Pricing (stored in centavos)
  sale_price          INTEGER NOT NULL DEFAULT 0,
  discounted_price    INTEGER NOT NULL DEFAULT 0,
  before_price        INTEGER,
  installation_price  INTEGER,
  dealer_price        INTEGER,
  
  -- Rating Overrides
  override_rating       BOOLEAN NOT NULL DEFAULT FALSE,
  display_rating        NUMERIC(3,2),
  display_reviews_count INTEGER,
  
  -- Promo Tags
  promo_tags          TEXT[],

  -- Specifications
  spec_warranty       TEXT,
  spec_support        TEXT,
  spec_material       TEXT,
  spec_voltage        TEXT,
  spec_dimension      TEXT,
  
  -- Media
  image_main          TEXT,
  image_1             TEXT,
  image_2             TEXT,
  image_3             TEXT,
  image_4             TEXT,
  video_1             TEXT,
  video_2             TEXT,
  
  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at for products
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

-- ── 2. Smart Lock Features ────────────────────────────────────────────────────
CREATE TABLE public.smartlock_features (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  pin_unlock            TEXT,
  rfid_unlock           TEXT,
  fingerprint_unlock    TEXT,
  face_recognition_3d   TEXT,
  palm_vein_unlock      TEXT,
  mechanical_key        TEXT,
  emergency_usb         TEXT,
  app_control           TEXT,
  bluetooth             TEXT,
  wifi                  TEXT,
  temporary_pin         TEXT,
  doorbell              TEXT,
  built_in_camera       TEXT,
  passage_mode          TEXT,
  auto_lock             TEXT,
  double_mortise        TEXT,
  door_thickness        TEXT,
  power_source          TEXT,
  battery_life          TEXT,
  body_material         TEXT
);

-- ── 3. Solar Power Features ───────────────────────────────────────────────────
CREATE TABLE public.solarpower_features (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  panel_type            TEXT,
  peak_power            TEXT,
  battery_capacity      TEXT,
  inverter_output       TEXT,
  mounting_type         TEXT,
  system_voltage        TEXT
);

-- ── 4. CCTV Features ──────────────────────────────────────────────────────────
CREATE TABLE public.cctv_features (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  resolution            TEXT,
  lens_type             TEXT,
  night_vision          TEXT,
  weatherproof_rating   TEXT,
  viewing_angle         TEXT,
  storage_support       TEXT,
  audio_type            TEXT,
  connectivity          TEXT
);

-- ── 5. Fire Extinguisher Features ─────────────────────────────────────────────
CREATE TABLE public.fireextinguisher_features (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  agent_type            TEXT,
  capacity              TEXT,
  fire_rating           TEXT,
  discharge_range       TEXT,
  discharge_time        TEXT,
  operating_pressure    TEXT,
  body_material         TEXT
);

-- ── 6. Product Reviews Table ──────────────────────────────────────────────────
CREATE TABLE public.product_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID REFERENCES public.products(id) ON DELETE CASCADE,
  parent_id           UUID REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  reviewer_name       TEXT NOT NULL,
  reviewer_email      TEXT,
  reviewer_url        TEXT,
  rating              INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment             TEXT,
  body                TEXT,
  is_approved         BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden           BOOLEAN NOT NULL DEFAULT FALSE,
  thumbs_up_count     INTEGER NOT NULL DEFAULT 0,
  media_urls          TEXT[] DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at for reviews
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_reviews_updated_at();

-- Indexes for product_reviews
CREATE INDEX IF NOT EXISTS idx_reviews_hidden       ON public.product_reviews(is_hidden);
CREATE INDEX IF NOT EXISTS idx_reviews_thumbsup     ON public.product_reviews(thumbs_up_count);
CREATE INDEX IF NOT EXISTS idx_reviews_created_desc ON public.product_reviews(created_at DESC);

-- RLS Policies for reviews
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read approved"
  ON public.product_reviews
  FOR SELECT
  USING (is_approved = true AND is_hidden = false);

CREATE POLICY "Public insert pending"
  ON public.product_reviews
  FOR INSERT
  WITH CHECK (is_approved = false);

CREATE POLICY "Auth full access"
  ON public.product_reviews
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 7. Customer Profiles (VIP Customer Portal) ──────────────────────────────
CREATE TABLE public.customer_profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  is_affiliate        BOOLEAN DEFAULT FALSE,
  affiliate_code      TEXT UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for Customer Profiles
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own profile."
  ON public.customer_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- ── 8. Supabase Storage review-media bucket ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-media',
  'review-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png',
    'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public read review-media"
  ON storage.objects FOR SELECT USING (bucket_id = 'review-media');

CREATE POLICY "Auth upload review-media"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'review-media');

CREATE POLICY "Auth delete review-media"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'review-media');
