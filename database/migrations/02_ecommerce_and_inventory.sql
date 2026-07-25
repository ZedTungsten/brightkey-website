-- =============================================================================
-- BrightKey Consolidated Ecommerce & Inventory Migration (02_ecommerce_and_inventory.sql)
-- Consolidates products, custom specs, price snapshots, features, reviews,
-- competitor pricing, warehouses, inventory, damaged goods, and triggers.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Products Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
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
  custom_specifications JSONB DEFAULT '[]'::jsonb,
  
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

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS spec_warranty TEXT,
  ADD COLUMN IF NOT EXISTS spec_support TEXT,
  ADD COLUMN IF NOT EXISTS spec_material TEXT,
  ADD COLUMN IF NOT EXISTS spec_voltage TEXT,
  ADD COLUMN IF NOT EXISTS spec_dimension TEXT,
  ADD COLUMN IF NOT EXISTS custom_specifications JSONB DEFAULT '[]'::jsonb;

-- ── 2. Smart Lock Features Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.smartlock_features (
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
CREATE TABLE IF NOT EXISTS public.product_reviews (
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

-- ── 4. Competitor Pricing Table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitor_pricing (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  product_id          UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  competitor_name     TEXT NOT NULL,
  competitor_sku      TEXT,
  competitor_price    INTEGER NOT NULL DEFAULT 0, -- stored in centavos
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Catalog Price Snapshots Table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_price_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  snapshot_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id          UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  sku                 TEXT NOT NULL,
  sale_price          INTEGER NOT NULL DEFAULT 0,
  discounted_price    INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Warehouses & Inventory Tables ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warehouses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  code                TEXT NOT NULL,
  location            TEXT,
  is_default          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_warehouse_code UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  warehouse_id        UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
  sku                 TEXT NOT NULL,
  available           INTEGER NOT NULL DEFAULT 0,
  reserved            INTEGER NOT NULL DEFAULT 0,
  damaged             INTEGER NOT NULL DEFAULT 0,
  reorder_point       INTEGER DEFAULT 5,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_inventory_sku_wh UNIQUE (company_id, warehouse_id, sku)
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  warehouse_id        UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
  sku                 TEXT NOT NULL,
  quantity            INTEGER NOT NULL,
  type                TEXT NOT NULL, -- 'inbound', 'outbound', 'transfer', 'adjustment', 'damaged'
  reference_id        TEXT,
  status              TEXT DEFAULT 'completed',
  notes               TEXT,
  qa_photo_url        TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS qa_photo_url TEXT;

-- ── 7. Damaged Goods Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.damaged_goods (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sku                 TEXT NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  reason              TEXT,
  reported_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier_id         UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  inventory_transaction_id UUID REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  reference_id        TEXT,
  status              TEXT NOT NULL DEFAULT 'unpacked',
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Functions & Triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_reviews_updated_at();

CREATE OR REPLACE FUNCTION public.track_product_cost_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.dealer_price IS DISTINCT FROM NEW.dealer_price THEN
    INSERT INTO public.product_cost_history (
      company_id, product_id, sku, old_dealer_price, new_dealer_price, changed_by
    ) VALUES (
      NEW.company_id, NEW.id, NEW.sku, OLD.dealer_price, NEW.dealer_price, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.validate_damaged_goods_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = NEW.supplier_id
      AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'The selected supplier does not belong to this company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_damaged_goods_supplier_trigger ON public.damaged_goods;
CREATE TRIGGER validate_damaged_goods_supplier_trigger
  BEFORE INSERT OR UPDATE OF supplier_id, company_id
  ON public.damaged_goods
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_damaged_goods_supplier();

CREATE OR REPLACE FUNCTION public.sync_damaged_goods_from_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status TEXT;
BEGIN
  next_status := CASE NEW.status
    WHEN 'inspect' THEN 'unpacked'
    WHEN 'packed' THEN 'packed'
    WHEN 'dispatched' THEN 'picked_up'
    WHEN 'received' THEN 'received'
    ELSE NULL
  END;

  IF next_status IS NOT NULL THEN
    UPDATE public.damaged_goods
    SET status = next_status,
        archived_at = CASE WHEN next_status = 'received' THEN COALESCE(archived_at, now()) ELSE NULL END,
        updated_at = now()
    WHERE inventory_transaction_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_damaged_goods_inventory_trigger ON public.inventory_transactions;
CREATE TRIGGER sync_damaged_goods_inventory_trigger
  AFTER UPDATE OF status
  ON public.inventory_transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_damaged_goods_from_inventory();

CREATE OR REPLACE FUNCTION public.sync_damaged_goods_from_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status TEXT;
BEGIN
  next_status := CASE
    WHEN NEW.status = 'delivered' THEN 'received'
    WHEN NEW.status = 'picked_up' THEN 'picked_up'
    ELSE 'booked'
  END;

  UPDATE public.damaged_goods
  SET status = next_status,
      archived_at = CASE WHEN next_status = 'received' THEN COALESCE(archived_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE reference_id = NEW.reference_id;
  RETURN NEW;
END;
$$;
