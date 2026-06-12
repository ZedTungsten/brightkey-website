-- =============================================================================
-- BrightKey Consolidated Ecommerce Schema (02_ecommerce.sql)
-- Consolidates products, features, reviews, pricing, coupons, shipping, and orders.
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.vouchers CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.shipping_areas CASCADE;
DROP TABLE IF EXISTS public.shipping_zones CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.pricing_tiers CASCADE;
DROP TABLE IF EXISTS public.product_reviews CASCADE;
DROP TABLE IF EXISTS public.smartlock_features CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;

-- ── 1. Products Table ────────────────────────────────────────────────────────
CREATE TABLE public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
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
  tags                TEXT[] DEFAULT '{}'::TEXT[],

  -- Settings Toggles
  show_on_ecommerce   BOOLEAN NOT NULL DEFAULT TRUE,
  count_inventory     BOOLEAN NOT NULL DEFAULT TRUE,
  show_features       BOOLEAN NOT NULL DEFAULT TRUE,
  show_specs          BOOLEAN NOT NULL DEFAULT TRUE,

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

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

-- ── 2. Smart Lock Features Table ──────────────────────────────────────────────
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

-- ── 3. Product Reviews Table ──────────────────────────────────────────────────
CREATE TABLE public.product_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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

CREATE OR REPLACE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_reviews_updated_at();

CREATE INDEX IF NOT EXISTS idx_reviews_hidden       ON public.product_reviews(is_hidden);
CREATE INDEX IF NOT EXISTS idx_reviews_thumbsup     ON public.product_reviews(thumbs_up_count);
CREATE INDEX IF NOT EXISTS idx_reviews_created_desc ON public.product_reviews(created_at DESC);

-- ── 4. Pricing Tiers Table ───────────────────────────────────────────────────
CREATE TABLE public.pricing_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  price_php   INTEGER NOT NULL,
  features    TEXT[] NOT NULL DEFAULT '{}',
  is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 5. Coupons Table ─────────────────────────────────────────────────────────
CREATE TABLE public.coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value      NUMERIC NOT NULL,
  start_date          TIMESTAMP WITH TIME ZONE,
  end_date            TIMESTAMP WITH TIME ZONE,
  applicable_businesses TEXT[] DEFAULT '{}'::TEXT[],
  applicable_categories TEXT[] DEFAULT '{}'::TEXT[],
  applicable_skus     TEXT[] DEFAULT '{}'::TEXT[],
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT coupons_code_company_id_key UNIQUE (code, company_id)
);

-- ── 6. Shipping Zones and Areas ──────────────────────────────────────────────
CREATE TABLE public.shipping_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  fee         INTEGER NOT NULL DEFAULT 0, -- fee in centavos (e.g. 15000 for ₱150.00)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.shipping_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  zone_id     UUID REFERENCES public.shipping_zones(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_area_name_company UNIQUE (name, company_id)
);

-- ── 7. Orders and Order Items Table ───────────────────────────────────────────
CREATE TABLE public.orders (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  customer_name       TEXT NOT NULL,
  customer_email      TEXT NOT NULL,
  customer_phone      TEXT,
  shipping_city       TEXT,
  shipping_address    TEXT,
  total_amount        INTEGER NOT NULL,
  shipping_fee        INTEGER,
  payment_intent_id   TEXT,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'cancelled')),
  channel             TEXT DEFAULT 'ecommerce' CHECK (channel IN ('ecommerce', 'installation')),
  fulfillment_status  TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned')),
  billing_address     JSONB DEFAULT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.order_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id            UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  price_at_purchase   INTEGER NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Vouchers Table ─────────────────────────────────────────────────────────
CREATE TABLE public.vouchers (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  code                TEXT UNIQUE NOT NULL,
  discount_value      NUMERIC(10,2) NOT NULL,
  discount_type       TEXT CHECK (discount_type IN ('fixed', 'percentage')),
  is_used             BOOLEAN DEFAULT FALSE,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. Row Level Security Policies ───────────────────────────────────────────

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

-- Products Policies
CREATE POLICY "Allow company product select" ON public.products
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company product write" ON public.products
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Product Reviews Policies
CREATE POLICY "Public read approved" ON public.product_reviews
  FOR SELECT USING (is_approved = true AND is_hidden = false);

CREATE POLICY "Public insert pending" ON public.product_reviews
  FOR INSERT WITH CHECK (is_approved = false);

CREATE POLICY "Company staff reviews access" ON public.product_reviews
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Pricing Tiers Policies
CREATE POLICY "Allow public read pricing_tiers" ON public.pricing_tiers
  FOR SELECT USING (true);

CREATE POLICY "Allow johnzeustaller manage pricing_tiers" ON public.pricing_tiers
  FOR ALL USING (
    auth.jwt() ->> 'email' = 'johnzeustaller@gmail.com'
  );

-- Coupons Policies
CREATE POLICY "Allow public read for coupons" ON public.coupons
  FOR SELECT USING (true);

CREATE POLICY "Company staff coupons access" ON public.coupons
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Shipping Zones Policies
CREATE POLICY "Public read active shipping zones" ON public.shipping_zones
  FOR SELECT USING (is_active = true);

CREATE POLICY "Company staff manage shipping zones" ON public.shipping_zones
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Shipping Areas Policies
CREATE POLICY "Public read shipping areas" ON public.shipping_areas
  FOR SELECT USING (true);

CREATE POLICY "Company staff manage shipping areas" ON public.shipping_areas
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Orders Policies
CREATE POLICY "Public can insert orders" ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Company staff orders access" ON public.orders
  FOR SELECT USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff orders write" ON public.orders
  FOR UPDATE USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff orders delete" ON public.orders
  FOR DELETE USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Order Items Policies
CREATE POLICY "Public can insert order items" ON public.order_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Company staff order_items access" ON public.order_items
  FOR SELECT USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff order_items write" ON public.order_items
  FOR UPDATE USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Company staff order_items delete" ON public.order_items
  FOR DELETE USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Vouchers Policies
CREATE POLICY "Customers can view own vouchers." ON public.vouchers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Company staff vouchers access" ON public.vouchers
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Seed initial pricing tiers
INSERT INTO public.pricing_tiers (name, price_php, features) VALUES
  ('eCommerce', 1200, ARRAY['Products', 'Customer Service', 'Logistics']),
  ('eCommerce+', 1500, ARRAY['eCommerce', 'Marketing', 'Sales']),
  ('eCommerce+ Accounting', 2200, ARRAY['All eCommerce+', 'Finance']),
  ('eCommerce+ Enterprise', 2800, ARRAY['All eCommerce+ Accounting', 'HR'])
ON CONFLICT (name) DO UPDATE
SET price_php = EXCLUDED.price_php,
    features = EXCLUDED.features;
