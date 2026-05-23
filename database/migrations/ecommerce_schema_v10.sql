-- =============================================================================
-- BrightKey Ecommerce Schema v10
-- Complete redesign: consolidated products table + business-specific features
-- Run this in Supabase SQL Editor
-- =============================================================================

-- ── 1. Drop old tables (cascade removes all dependent objects) ────────────────
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.product_images CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;

-- Also drop any old feature tables if they exist from prior experiments
DROP TABLE IF EXISTS public.smartlock_features CASCADE;
DROP TABLE IF EXISTS public.solarpower_features CASCADE;
DROP TABLE IF EXISTS public.cctv_features CASCADE;
DROP TABLE IF EXISTS public.fireextinguisher_features CASCADE;
DROP TABLE IF EXISTS public.product_reviews CASCADE;

-- ── 2. Core products table ────────────────────────────────────────────────────
CREATE TABLE public.products (

  -- Identity
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
  variant_name        TEXT,   -- label for the selector, e.g. "Side"
  variant_value       TEXT,   -- option value, e.g. "Left" / "Right"

  -- Cross-sells / recommendations (array of SKUs)
  related_skus        TEXT[],

  -- Pricing (all stored in centavos)
  sale_price          INTEGER NOT NULL DEFAULT 0,          -- normal everyday price
  discounted_price    INTEGER NOT NULL DEFAULT 0,          -- promo price; 0 = no active promo
  before_price        INTEGER,                             -- strikethrough / was-price
  installation_price  INTEGER,                             -- fixed price when checked out with installation

  -- Specifications (inline, no separate table)
  spec_warranty       TEXT,
  spec_support        TEXT,
  spec_material       TEXT,
  spec_voltage        TEXT,
  spec_dimension      TEXT,

  -- Media (fixed slots — 1 main + 4 supporting images + 2 videos)
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

-- Auto-update updated_at
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

-- ── 3. Smart Lock Features ────────────────────────────────────────────────────
-- Each column is TEXT. Convention:
--   NULL / ''  → feature not present
--   'x'        → feature present, no specific detail
--   Other text → feature present with specific detail (e.g. 'IP66', 'TTLock')
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
  app_control           TEXT,   -- e.g. 'x', 'TTLock', 'Tuya'
  bluetooth             TEXT,
  wifi                  TEXT,
  temporary_pin         TEXT,
  doorbell              TEXT,
  intercom              TEXT,
  monitoring            TEXT,
  dual_cameras          TEXT,
  waterproof            TEXT,   -- e.g. 'x', 'IP66', 'IP54'
  fireproof             TEXT,
  scratchproof          TEXT,
  sunproof              TEXT,
  moisture_proof        TEXT,
  splash_proof          TEXT
);

-- ── 4. Solar Power Features ───────────────────────────────────────────────────
CREATE TABLE public.solarpower_features (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  grid_tie          TEXT,
  off_grid          TEXT,
  hybrid            TEXT,
  mppt_controller   TEXT,
  monitoring_app    TEXT,   -- e.g. 'x', 'Solis', 'Huawei'
  battery_backup    TEXT,   -- e.g. 'x', '10kWh'
  auto_switching    TEXT,
  weather_resistant TEXT,   -- e.g. 'x', 'IP65'
  wifi_connect      TEXT,
  mobile_alerts     TEXT
);

-- ── 5. CCTV Features ──────────────────────────────────────────────────────────
CREATE TABLE public.cctv_features (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  night_vision      TEXT,   -- e.g. 'x', '40m', 'Color'
  resolution        TEXT,   -- e.g. '1080p', '4K'
  pan_tilt_zoom     TEXT,
  motion_detection  TEXT,   -- e.g. 'x', 'AI'
  two_way_audio     TEXT,
  cloud_storage     TEXT,
  local_storage     TEXT,   -- e.g. 'x', '256GB'
  weatherproof      TEXT,   -- e.g. 'x', 'IP67'
  wide_angle        TEXT,   -- e.g. 'x', '120°'
  ai_detection      TEXT,   -- e.g. 'x', 'Face', 'Vehicle'
  mobile_app        TEXT,   -- e.g. 'x', 'Hik-Connect', 'Dahua'
  poe_support       TEXT
);

-- ── 6. Fire Extinguisher Features ─────────────────────────────────────────────
CREATE TABLE public.fireextinguisher_features (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type_abc          TEXT,
  type_co2          TEXT,
  type_dry_chemical TEXT,
  type_foam         TEXT,
  wall_mountable    TEXT,
  vehicle_mountable TEXT,
  refillable        TEXT,
  pressure_gauge    TEXT,
  with_bracket      TEXT,
  with_hose         TEXT
);

-- ── 7. Product Reviews (shared across all business types) ─────────────────────
CREATE TABLE public.product_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reviewer_name   TEXT,
  reviewer_email  TEXT,
  rating          INTEGER CHECK (rating BETWEEN 1 AND 5),   -- nullable for admin replies
  body            TEXT,
  parent_id       UUID REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  is_approved     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. Inventory (separate, linked by SKU) ────────────────────────────────────
CREATE TABLE public.inventory (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                 TEXT UNIQUE NOT NULL,   -- matches products.sku
  available           INTEGER NOT NULL DEFAULT 0,
  ordered_past_month  INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();

-- ── 9. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_products_sku          ON public.products(sku);
CREATE INDEX idx_products_slug         ON public.products(slug);
CREATE INDEX idx_products_business     ON public.products(business);
CREATE INDEX idx_products_status       ON public.products(status);
CREATE INDEX idx_products_parent_sku   ON public.products(parent_sku);

CREATE INDEX idx_smartlock_pid         ON public.smartlock_features(product_id);
CREATE INDEX idx_solarpower_pid        ON public.solarpower_features(product_id);
CREATE INDEX idx_cctv_pid              ON public.cctv_features(product_id);
CREATE INDEX idx_fireext_pid           ON public.fireextinguisher_features(product_id);
CREATE INDEX idx_reviews_pid           ON public.product_reviews(product_id);
CREATE INDEX idx_reviews_parent        ON public.product_reviews(parent_id);
CREATE INDEX idx_inventory_sku         ON public.inventory(sku);

-- ── 10. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.products                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartlock_features        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solarpower_features       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cctv_features             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fireextinguisher_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory                 ENABLE ROW LEVEL SECURITY;

-- products — full public access (admin dashboard runs as anon key)
CREATE POLICY "Allow public select" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.products FOR DELETE USING (true);

-- smartlock_features
CREATE POLICY "Allow public select" ON public.smartlock_features FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.smartlock_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.smartlock_features FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.smartlock_features FOR DELETE USING (true);

-- solarpower_features
CREATE POLICY "Allow public select" ON public.solarpower_features FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.solarpower_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.solarpower_features FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.solarpower_features FOR DELETE USING (true);

-- cctv_features
CREATE POLICY "Allow public select" ON public.cctv_features FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.cctv_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.cctv_features FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.cctv_features FOR DELETE USING (true);

-- fireextinguisher_features
CREATE POLICY "Allow public select" ON public.fireextinguisher_features FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.fireextinguisher_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.fireextinguisher_features FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.fireextinguisher_features FOR DELETE USING (true);

-- product_reviews — guests can read approved + submit pending; auth has full access
CREATE POLICY "Public read approved"     ON public.product_reviews FOR SELECT USING (is_approved = true);
CREATE POLICY "Public insert pending"    ON public.product_reviews FOR INSERT WITH CHECK (is_approved = false);
CREATE POLICY "Auth full access"         ON public.product_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- inventory — full public access
CREATE POLICY "Allow public select" ON public.inventory FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.inventory FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.inventory FOR DELETE USING (true);
