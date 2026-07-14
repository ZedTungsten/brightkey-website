-- ==========================================
-- Source: 02_ecommerce.sql
-- ==========================================

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


-- ==========================================
-- Source: 12_warehouses.sql
-- ==========================================

-- ============================================================
-- Migration: 12_warehouses.sql
-- Creates the warehouses, warehouse_managers, and warehouse_transfers
-- tables, alters inventory to track per-warehouse stock levels,
-- backfills legacy records, and establishes RLS policies.
-- ============================================================

DROP TABLE IF EXISTS public.warehouse_transfers CASCADE;
DROP TABLE IF EXISTS public.warehouse_managers CASCADE;
DROP TABLE IF EXISTS public.warehouses CASCADE;

-- ── 1. Create warehouses Table ──────────────────────────────────────────
CREATE TABLE public.warehouses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  street_address text,
  city        text,
  province    text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Create warehouse_managers Table ──────────────────────────────────
CREATE TABLE public.warehouse_managers (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid    NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  user_id      uuid    REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_email text,
  can_inspect  boolean NOT NULL DEFAULT true,
  can_pack     boolean NOT NULL DEFAULT true,
  can_dispatch boolean NOT NULL DEFAULT true,
  can_receive  boolean NOT NULL DEFAULT true,
  can_transfer boolean NOT NULL DEFAULT true,
  can_order    boolean NOT NULL DEFAULT true,
  can_edit_stocks boolean NOT NULL DEFAULT true,
  can_manage_all_orders boolean NOT NULL DEFAULT true,
  can_cancel   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, user_id)
);

-- ── 3. Alter inventory and inventory_transactions ───────────────────────

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_id ON public.inventory(warehouse_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_warehouse_sku_unique'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_warehouse_sku_unique UNIQUE (warehouse_id, sku);
  END IF;
END $$;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse_id ON public.inventory_transactions(warehouse_id);

-- ── 4. Backfill legacy records to the first warehouse of each tenant ────

UPDATE public.inventory inv
SET warehouse_id = (
  SELECT it.warehouse_id
  FROM public.inventory_transactions it
  WHERE it.sku = inv.sku
    AND it.warehouse_id IS NOT NULL
  LIMIT 1
)
WHERE inv.warehouse_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.inventory_transactions it2
    WHERE it2.sku = inv.sku AND it2.warehouse_id IS NOT NULL
  );

UPDATE public.inventory
SET warehouse_id = (
  SELECT id FROM public.warehouses ORDER BY created_at ASC LIMIT 1
)
WHERE warehouse_id IS NULL;

UPDATE public.inventory_transactions
SET warehouse_id = (
  SELECT id FROM public.warehouses ORDER BY created_at ASC LIMIT 1
)
WHERE warehouse_id IS NULL;

-- ── 5. Create warehouse_transfers Table ─────────────────────────────────

CREATE TABLE public.warehouse_transfers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_warehouse_id     uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id       uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  sku                   text        NOT NULL,
  quantity              integer     NOT NULL CHECK (quantity > 0),
  status                text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'received')),
  requested_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_id        ON public.warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_managers_wh_id    ON public.warehouse_managers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_managers_user_id  ON public.warehouse_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_company_id ON public.warehouse_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_wh ON public.warehouse_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_wh   ON public.warehouse_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_status  ON public.warehouse_transfers(status);

-- ── 7. Row Level Security Policies ──────────────────────────────────────

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

-- Warehouses Policies (Logistics module role-gated)
CREATE POLICY "Logistics module warehouses" ON public.warehouses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.tenant_id = warehouses.tenant_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.tenant_id = warehouses.tenant_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  );

-- Warehouse Managers Policies
CREATE POLICY "Logistics module warehouse_managers" ON public.warehouse_managers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouses w
      JOIN public.companies c ON c.tenant_id = w.tenant_id
      WHERE w.id = warehouse_managers.warehouse_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.warehouses w
      JOIN public.companies c ON c.tenant_id = w.tenant_id
      WHERE w.id = warehouse_managers.warehouse_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  );

-- Warehouse Transfers Policies
CREATE POLICY "Logistics module warehouse_transfers" ON public.warehouse_transfers
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Logistics'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Logistics'));


-- ==========================================
-- Source: 29_backfill_products_company_id.sql
-- ==========================================

-- Backfill product company_id for the seeded products to match the 'BrightKey' company
UPDATE public.products
SET company_id = (SELECT id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1)
WHERE company_id IS NULL;


-- ==========================================
-- Source: 39_fix_inventory_warehouse_unique_key.sql
-- ==========================================

-- Drop the legacy global SKU uniqueness that prevents the same SKU from
-- existing in multiple warehouses, then keep uniqueness scoped per warehouse.

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_sku_key;

DROP INDEX IF EXISTS public.inventory_sku_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_warehouse_sku_unique'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_warehouse_sku_unique UNIQUE (warehouse_id, sku);
  END IF;
END $$;


-- ==========================================
-- Source: 43_warehouse_managers_all_orders.sql
-- ==========================================

-- Alter warehouse_managers table to add can_manage_all_orders column
ALTER TABLE public.warehouse_managers
  ADD COLUMN IF NOT EXISTS can_manage_all_orders boolean NOT NULL DEFAULT true;


-- ==========================================
-- Source: 51_product_cost_history.sql
-- ==========================================

-- Create product_cost_history table
CREATE TABLE public.product_cost_history (
  id          SERIAL PRIMARY KEY,
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  cost        INTEGER NOT NULL DEFAULT 0, -- stored in centavos (PHP * 100)
  start_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date    TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Finance module product_cost_history" ON public.product_cost_history
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Finance'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Finance'));

-- Trigger function to track products cost history
CREATE OR REPLACE FUNCTION public.track_product_cost_history()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Insert initial cost history record
    INSERT INTO public.product_cost_history (company_id, product_id, sku, cost, start_date, end_date)
    VALUES (NEW.company_id, NEW.id, NEW.sku, COALESCE(NEW.dealer_price, 0), NOW(), NULL);
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If dealer_price or sku changed, end current cost history and insert new one
    IF (OLD.dealer_price IS DISTINCT FROM NEW.dealer_price OR OLD.sku IS DISTINCT FROM NEW.sku) THEN
      UPDATE public.product_cost_history
      SET end_date = NOW()
      WHERE product_id = NEW.id AND end_date IS NULL;
      
      INSERT INTO public.product_cost_history (company_id, product_id, sku, cost, start_date, end_date)
      VALUES (NEW.company_id, NEW.id, NEW.sku, COALESCE(NEW.dealer_price, 0), NOW(), NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE OR REPLACE TRIGGER trg_track_product_cost_history
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.track_product_cost_history();

-- Backfill existing products
INSERT INTO public.product_cost_history (company_id, product_id, sku, cost, start_date, end_date)
SELECT company_id, id, sku, COALESCE(dealer_price, 0), created_at, NULL
FROM public.products;


-- ==========================================
-- Source: 58_add_warehouse_address.sql
-- ==========================================

-- Add address fields to warehouses table
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS province TEXT;


-- ==========================================
-- Source: 59_update_warehouse_managers_permissions.sql
-- ==========================================

-- Update warehouse_managers table to support additional permissions
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_inspect BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_transfer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_order BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS can_edit_stocks BOOLEAN NOT NULL DEFAULT true;


-- ==========================================
-- Source: 60_make_warehouse_managers_user_id_nullable.sql
-- ==========================================

-- Make user_id nullable and add employee_email column to warehouse_managers
ALTER TABLE public.warehouse_managers ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.warehouse_managers ADD COLUMN IF NOT EXISTS employee_email TEXT;
