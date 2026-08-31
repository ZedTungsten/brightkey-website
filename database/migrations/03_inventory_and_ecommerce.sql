-- Consolidated Database Migration: 03_inventory_and_ecommerce.sql
-- Generated on 2026-08-06T15:24:48.291Z


-- =========================================================================
-- SOURCE FILE: 02_ecommerce_and_inventory.sql
-- =========================================================================

-- =============================================================================
-- BrightKey Consolidated Ecommerce & Inventory Migration (02_ecommerce_and_inventory.sql)
-- Consolidates products, custom specs, price snapshots, features, reviews,
-- competitor pricing, warehouses, inventory, damaged goods, and triggers.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Products Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
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


-- =========================================================================
-- SOURCE FILE: 14_repair_inventory_transaction_ownership.sql
-- =========================================================================

-- Repair warehouse queue visibility and prevent future orphaned transactions.
-- Ownership is derived through warehouses.tenant_id because the live warehouses
-- table is tenant-owned rather than directly company-owned.

UPDATE public.inventory_transactions AS transaction
SET company_id = company.id
FROM public.warehouses AS warehouse
JOIN public.companies AS company
  ON company.tenant_id = warehouse.tenant_id
WHERE transaction.company_id IS NULL
  AND transaction.warehouse_id = warehouse.id;

UPDATE public.inventory_transactions AS transaction
SET company_id = booking.company_id
FROM public.installation_bookings AS booking
WHERE transaction.company_id IS NULL
  AND booking.company_id IS NOT NULL
  AND booking.order_no = transaction.reference_id;

UPDATE public.inventory_transactions AS transaction
SET warehouse_id = chosen_warehouse.id
FROM public.companies AS company
JOIN LATERAL (
  SELECT warehouse.id
  FROM public.warehouses AS warehouse
  WHERE warehouse.tenant_id = company.tenant_id
    AND warehouse.is_active = TRUE
  ORDER BY warehouse.created_at ASC, warehouse.id ASC
  LIMIT 1
) AS chosen_warehouse ON TRUE
WHERE transaction.warehouse_id IS NULL
  AND transaction.company_id = company.id
  AND EXISTS (
    SELECT 1
    FROM public.installation_bookings AS booking
    WHERE booking.company_id = transaction.company_id
      AND booking.order_no = transaction.reference_id
  );

CREATE OR REPLACE FUNCTION public.enforce_inventory_transaction_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  warehouse_company_id UUID;
BEGIN
  IF NEW.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'A warehouse is required for every inventory transaction.';
  END IF;

  SELECT company.id
  INTO warehouse_company_id
  FROM public.warehouses AS warehouse
  JOIN public.companies AS company
    ON company.tenant_id = warehouse.tenant_id
  WHERE warehouse.id = NEW.warehouse_id
  LIMIT 1;

  IF warehouse_company_id IS NULL THEN
    RAISE EXCEPTION 'The selected warehouse is not linked to a company.';
  END IF;

  IF NEW.company_id IS NULL THEN
    NEW.company_id := warehouse_company_id;
  ELSIF NEW.company_id <> warehouse_company_id THEN
    RAISE EXCEPTION 'The selected warehouse does not belong to this company.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_inventory_transaction_ownership
  ON public.inventory_transactions;

CREATE TRIGGER trg_enforce_inventory_transaction_ownership
BEFORE INSERT OR UPDATE OF company_id, warehouse_id
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inventory_transaction_ownership();


-- =========================================================================
-- SOURCE FILE: 16_get_warehouse_tab_counts.sql
-- =========================================================================

-- =============================================================================
-- Migration 16: Efficient Warehouse Tab Badge Counting RPC (16_get_warehouse_tab_counts.sql)
-- Calculates Receive, Inspect, Pack, and Dispatch badge counts on the database server.
-- All operations are safe and non-destructive.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  receive_count BIGINT,
  inspect_count BIGINT,
  pack_count BIGINT,
  dispatch_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_receive_count BIGINT := 0;
  v_inspect_count BIGINT := 0;
  v_pack_count BIGINT := 0;
  v_dispatch_count BIGINT := 0;
BEGIN
  -- Inspect Count (distinct customer_order reference_ids with status = 'reserved')
  SELECT COUNT(DISTINCT t.reference_id)
  INTO v_inspect_count
  FROM public.inventory_transactions t
  WHERE t.company_id = p_company_id
    AND t.status = 'reserved'
    AND t.type = 'customer_order'
    AND t.reference_id IS NOT NULL
    AND UPPER(TRIM(t.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND t.sku NOT LIKE 'OC-%'
    AND t.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR t.warehouse_id = p_warehouse_id);

  -- Pack Count (distinct customer_order reference_ids with status = 'inspect')
  SELECT COUNT(DISTINCT t.reference_id)
  INTO v_pack_count
  FROM public.inventory_transactions t
  WHERE t.company_id = p_company_id
    AND t.status = 'inspect'
    AND t.type = 'customer_order'
    AND t.reference_id IS NOT NULL
    AND UPPER(TRIM(t.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND t.sku NOT LIKE 'OC-%'
    AND t.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR t.warehouse_id = p_warehouse_id);

  -- Dispatch Count (packed transactions that have no remaining reserved/inspect items)
  SELECT COUNT(DISTINCT t.reference_id)
  INTO v_dispatch_count
  FROM public.inventory_transactions t
  WHERE t.company_id = p_company_id
    AND t.status = 'packed'
    AND t.type = 'customer_order'
    AND t.reference_id IS NOT NULL
    AND UPPER(TRIM(t.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND t.sku NOT LIKE 'OC-%'
    AND t.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR t.warehouse_id = p_warehouse_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_transactions other
      WHERE other.company_id = p_company_id
        AND other.reference_id = t.reference_id
        AND other.status IN ('reserved', 'inspect')
        AND UPPER(TRIM(other.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
        AND other.sku NOT LIKE 'OC-%'
        AND other.sku NOT LIKE 'BJ-%'
    );

  -- Receive Count (matching selected warehouse + approved incoming transfers)
  SELECT
    (
      SELECT COUNT(DISTINCT t.id)
      FROM public.inventory_transactions t
      WHERE t.company_id = p_company_id
        AND t.status IN ('ordered', 'returned', 'cancelled')
        AND t.type <> 'supplier_order'
        AND (
          (p_warehouse_id IS NOT NULL AND t.warehouse_id = p_warehouse_id) OR
          (p_warehouse_id IS NULL AND (t.warehouse_id IS NULL OR t.warehouse_id = p_warehouse_id))
        )
    ) + (
      SELECT COUNT(*)
      FROM public.inventory_transactions tr
      WHERE tr.company_id = p_company_id
        AND tr.type = 'transfer'
        AND tr.status = 'approved'
        AND (p_warehouse_id IS NULL OR tr.warehouse_id = p_warehouse_id)
    )
  INTO v_receive_count;

  RETURN QUERY SELECT
    COALESCE(v_receive_count, 0),
    COALESCE(v_inspect_count, 0),
    COALESCE(v_pack_count, 0),
    COALESCE(v_dispatch_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID) TO authenticated, service_role;


-- =========================================================================
-- SOURCE FILE: 21_atomic_inventory_reservations.sql
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_company_warehouse_sku
  ON public.inventory (company_id, warehouse_id, sku);

CREATE OR REPLACE FUNCTION public.reserve_customer_order_inventory(
  p_company_id UUID,
  p_warehouse_id UUID,
  p_reference_id TEXT,
  p_customer_name TEXT,
  p_customer_city TEXT,
  p_reserved_at TIMESTAMPTZ,
  p_items JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  inserted_count INTEGER := 0;
BEGIN
  IF p_company_id IS NULL OR p_warehouse_id IS NULL OR NULLIF(trim(p_reference_id), '') IS NULL THEN
    RAISE EXCEPTION 'Company, warehouse, and reference are required.';
  END IF;

  IF NOT (
    public.has_module_access((SELECT auth.uid()), p_company_id, 'Operations')
    OR public.has_module_access((SELECT auth.uid()), p_company_id, 'Logistics')
  ) THEN
    RAISE EXCEPTION 'Inventory reservation access is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses AS warehouse
    JOIN public.companies AS company ON company.tenant_id = warehouse.tenant_id
    WHERE warehouse.id = p_warehouse_id
      AND company.id = p_company_id
      AND warehouse.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'The selected warehouse is not available for this company.';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one inventory item is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_company_id::TEXT || ':' || p_reference_id, 0)
  );

  FOR item IN
    SELECT
      upper(trim(value->>'sku')) AS sku,
      sum((value->>'quantity')::INTEGER) AS quantity
    FROM jsonb_array_elements(p_items)
    WHERE NULLIF(trim(value->>'sku'), '') IS NOT NULL
      AND (value->>'quantity') ~ '^[1-9][0-9]*$'
    GROUP BY upper(trim(value->>'sku'))
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.inventory_transactions AS transaction
      WHERE transaction.company_id = p_company_id
        AND transaction.warehouse_id = p_warehouse_id
        AND transaction.reference_id = p_reference_id
        AND transaction.sku = item.sku
        AND transaction.type = 'customer_order'
        AND transaction.status IN ('reserved', 'inspect', 'packed', 'dispatched')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory (
      company_id,
      warehouse_id,
      sku,
      available,
      reserved
    )
    VALUES (
      p_company_id,
      p_warehouse_id,
      item.sku,
      -item.quantity,
      item.quantity
    )
    ON CONFLICT (company_id, warehouse_id, sku)
    DO UPDATE SET
      available = public.inventory.available - EXCLUDED.reserved,
      reserved = public.inventory.reserved + EXCLUDED.reserved,
      updated_at = NOW();

    INSERT INTO public.inventory_transactions (
      company_id,
      warehouse_id,
      sku,
      quantity,
      type,
      status,
      reference_id,
      customer_name,
      customer_city,
      timestamp_reserved
    )
    VALUES (
      p_company_id,
      p_warehouse_id,
      item.sku,
      item.quantity,
      'customer_order',
      'reserved',
      p_reference_id,
      p_customer_name,
      p_customer_city,
      COALESCE(p_reserved_at, NOW())
    );

    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_customer_order_inventory(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_customer_order_inventory(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB
) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 22_inventory_monthly_stats.sql
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_reserved_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_reserved)
  WHERE timestamp_reserved IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_dispatched_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_dispatched)
  WHERE timestamp_dispatched IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_returned_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_returned)
  WHERE timestamp_returned IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_cancelled_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_cancelled)
  WHERE timestamp_cancelled IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_inventory_monthly_stats(
  p_company_id UUID,
  p_warehouse_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS TABLE (
  sku TEXT,
  reserved BIGINT,
  dispatched BIGINT,
  returned BIGINT,
  cancelled BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    transaction.sku,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_reserved >= p_period_start
        AND transaction.timestamp_reserved < p_period_end
    ), 0)::BIGINT AS reserved,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_dispatched >= p_period_start
        AND transaction.timestamp_dispatched < p_period_end
    ), 0)::BIGINT AS dispatched,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_returned >= p_period_start
        AND transaction.timestamp_returned < p_period_end
    ), 0)::BIGINT AS returned,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_cancelled >= p_period_start
        AND transaction.timestamp_cancelled < p_period_end
    ), 0)::BIGINT AS cancelled
  FROM public.inventory_transactions AS transaction
  WHERE transaction.company_id = p_company_id
    AND transaction.warehouse_id = p_warehouse_id
    AND (
      (transaction.timestamp_reserved >= p_period_start AND transaction.timestamp_reserved < p_period_end)
      OR (transaction.timestamp_dispatched >= p_period_start AND transaction.timestamp_dispatched < p_period_end)
      OR (transaction.timestamp_returned >= p_period_start AND transaction.timestamp_returned < p_period_end)
      OR (transaction.timestamp_cancelled >= p_period_start AND transaction.timestamp_cancelled < p_period_end)
    )
  GROUP BY transaction.sku;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_monthly_stats(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_inventory_monthly_stats(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 27_align_warehouse_receive_badge.sql
-- =========================================================================

-- =============================================================================
-- Keep the Receive badge count aligned with the Receive queue.
-- The original RPC counted approved transfers from inventory_transactions,
-- while the queue reads them from warehouse_transfers.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  receive_count BIGINT,
  inspect_count BIGINT,
  pack_count BIGINT,
  dispatch_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_receive_count BIGINT := 0;
  v_inspect_count BIGINT := 0;
  v_pack_count BIGINT := 0;
  v_dispatch_count BIGINT := 0;
BEGIN
  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_inspect_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'reserved'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_pack_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'inspect'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_dispatch_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'packed'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_transactions other
      WHERE other.company_id = p_company_id
        AND other.reference_id = tx.reference_id
        AND other.status IN ('reserved', 'inspect')
        AND UPPER(TRIM(other.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
        AND other.sku NOT LIKE 'OC-%'
        AND other.sku NOT LIKE 'BJ-%'
    );

  SELECT
    (
      SELECT COUNT(*)
      FROM public.inventory_transactions tx
      WHERE tx.company_id = p_company_id
        AND (
          (p_warehouse_id IS NOT NULL AND tx.warehouse_id = p_warehouse_id)
          OR (p_warehouse_id IS NULL AND tx.warehouse_id IS NULL)
        )
        AND (
          tx.type <> 'customer_order'
          OR (
            tx.reference_id IS NOT NULL
            AND (
              tx.reference_id LIKE 'ORD-%'
              OR tx.reference_id LIKE 'OC-%'
              OR tx.reference_id LIKE 'RCV-%'
              OR tx.reference_id LIKE 'SND-%'
            )
          )
        )
        AND (
          (
            tx.reference_id IS NOT NULL
            AND (
              tx.reference_id LIKE 'RCV-%'
              OR tx.reference_id LIKE 'SUP-%'
            )
            AND tx.status IN ('ordered', 'dispatched')
            AND EXISTS (
              SELECT 1
              FROM public.delivery_bookings delivery
              WHERE delivery.company_id = p_company_id
                AND delivery.reference_id = tx.reference_id
            )
          )
          OR (
            (
              tx.reference_id IS NULL
              OR (
                tx.reference_id NOT LIKE 'RCV-%'
                AND tx.reference_id NOT LIKE 'SUP-%'
              )
            )
            AND tx.status IN ('ordered', 'returned', 'cancelled')
            AND tx.type <> 'supplier_order'
          )
        )
    )
    + (
      SELECT COUNT(*)
      FROM public.warehouse_transfers transfer
      WHERE transfer.company_id = p_company_id
        AND transfer.status = 'approved'
        AND transfer.to_warehouse_id = p_warehouse_id
    )
  INTO v_receive_count;

  RETURN QUERY SELECT
    COALESCE(v_receive_count, 0),
    COALESCE(v_inspect_count, 0),
    COALESCE(v_pack_count, 0),
    COALESCE(v_dispatch_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID)
  TO authenticated, service_role;


-- =========================================================================
-- SOURCE FILE: 47_sync_damaged_goods_inventory.sql
-- =========================================================================

-- Keep issued damaged goods and warehouse availability in sync.
-- Non-destructive and rerunnable: existing unpacked records are reconciled by
-- the page-level RPC the next time the Damaged Goods page is loaded.

ALTER TABLE public.damaged_goods
  ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_reserved_sku TEXT,
  ADD COLUMN IF NOT EXISTS inventory_reserved_warehouse_id UUID,
  ADD COLUMN IF NOT EXISTS inventory_reserved_quantity INTEGER;

-- A warehouse UUID is globally unique, so warehouse + SKU is the stable
-- inventory identity on both the live tenant-owned schema and clean installs.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_warehouse_sku_unique
  ON public.inventory (warehouse_id, sku);

CREATE OR REPLACE FUNCTION public.sync_damaged_goods_inventory(
  p_damage_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  damage_row public.damaged_goods%ROWTYPE;
  supplier_name TEXT;
  supplier_city TEXT;
  target_warehouse_id UUID;
  target_quantity INTEGER;
  target_reference TEXT;
  transaction_id UUID;
  transaction_status TEXT;
  changed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO damage_row
  FROM public.damaged_goods
  WHERE id = p_damage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The damaged goods record could not be found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = damage_row.company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this damaged goods record.';
  END IF;

  target_quantity := GREATEST(COALESCE(damage_row.quantity, 1), 1);
  target_warehouse_id := COALESCE(
    p_warehouse_id,
    damage_row.inventory_reserved_warehouse_id,
    (
      SELECT warehouse_id
      FROM public.inventory_transactions
      WHERE id = damage_row.inventory_transaction_id
        AND company_id = damage_row.company_id
    )
  );

  -- Release a prior reservation when the record no longer represents unpacked
  -- warehouse stock, or its SKU/warehouse/quantity has changed.
  IF damage_row.inventory_reserved_at IS NOT NULL AND (
    COALESCE(damage_row.status, 'unpacked') <> 'unpacked'
    OR damage_row.archived_at IS NOT NULL
    OR damage_row.inventory_reserved_sku IS DISTINCT FROM damage_row.sku
    OR damage_row.inventory_reserved_warehouse_id IS DISTINCT FROM target_warehouse_id
    OR damage_row.inventory_reserved_quantity IS DISTINCT FROM target_quantity
  ) THEN
    SELECT status INTO transaction_status
    FROM public.inventory_transactions
    WHERE id = damage_row.inventory_transaction_id
      AND company_id = damage_row.company_id;

    IF transaction_status IS NOT NULL AND transaction_status <> 'inspect' THEN
      RAISE EXCEPTION 'Only an unpacked damaged item can be removed from warehouse inventory.';
    END IF;

    INSERT INTO public.inventory (company_id, warehouse_id, sku, available, reserved)
    VALUES (
      damage_row.company_id,
      damage_row.inventory_reserved_warehouse_id,
      damage_row.inventory_reserved_sku,
      damage_row.inventory_reserved_quantity,
      0
    )
    ON CONFLICT (warehouse_id, sku) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        available = public.inventory.available + EXCLUDED.available,
        reserved = GREATEST(0, public.inventory.reserved - damage_row.inventory_reserved_quantity),
        updated_at = now();

    IF damage_row.inventory_transaction_id IS NOT NULL THEN
      DELETE FROM public.inventory_transactions
      WHERE id = damage_row.inventory_transaction_id
        AND company_id = damage_row.company_id
        AND status = 'inspect';
    END IF;

    UPDATE public.damaged_goods
    SET inventory_transaction_id = NULL,
        inventory_reserved_at = NULL,
        inventory_reserved_sku = NULL,
        inventory_reserved_warehouse_id = NULL,
        inventory_reserved_quantity = NULL,
        updated_at = now()
    WHERE id = damage_row.id;

    damage_row.inventory_transaction_id := NULL;
    damage_row.inventory_reserved_at := NULL;
    changed := TRUE;
  END IF;

  -- Customer-possession and archived items are deliberately excluded from the
  -- warehouse ledger.
  IF COALESCE(damage_row.status, 'unpacked') <> 'unpacked'
     OR damage_row.archived_at IS NOT NULL THEN
    -- Old customer-possession records may have been linked to Pack without ever
    -- changing inventory. Remove that stale inspect entry without touching stock.
    IF damage_row.inventory_reserved_at IS NULL
       AND damage_row.inventory_transaction_id IS NOT NULL THEN
      DELETE FROM public.inventory_transactions
      WHERE id = damage_row.inventory_transaction_id
        AND company_id = damage_row.company_id
        AND status = 'inspect';

      UPDATE public.damaged_goods
      SET inventory_transaction_id = NULL,
          updated_at = now()
      WHERE id = damage_row.id;
      changed := TRUE;
    END IF;
    RETURN changed;
  END IF;

  IF target_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Select a warehouse before issuing damaged goods.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses w
    JOIN public.companies c ON c.tenant_id = w.tenant_id
    WHERE w.id = target_warehouse_id
      AND c.id = damage_row.company_id
  ) THEN
    RAISE EXCEPTION 'The selected warehouse is not available for this company.';
  END IF;

  IF damage_row.inventory_reserved_at IS NULL THEN
    target_reference := COALESCE(
      NULLIF(damage_row.reference_id, ''),
      'SND-DMG-' || to_char(COALESCE(damage_row.created_at, now()), 'YYYYMMDD') || '-' || upper(left(damage_row.id::text, 6))
    );

    SELECT s.name, COALESCE(s.city, s.province, '')
    INTO supplier_name, supplier_city
    FROM public.suppliers s
    WHERE s.id = damage_row.supplier_id
      AND s.company_id = damage_row.company_id;

    SELECT id INTO transaction_id
    FROM public.inventory_transactions
    WHERE company_id = damage_row.company_id
      AND warehouse_id = target_warehouse_id
      AND reference_id = target_reference
    ORDER BY created_at DESC
    LIMIT 1;

    IF transaction_id IS NULL THEN
      INSERT INTO public.inventory_transactions (
        company_id, warehouse_id, sku, quantity, type, status, reference_id,
        customer_name, customer_city, timestamp_inspect
      ) VALUES (
        damage_row.company_id, target_warehouse_id, damage_row.sku,
        target_quantity, 'customer_order', 'inspect', target_reference,
        COALESCE(supplier_name, 'Damaged Goods'), COALESCE(supplier_city, ''), now()
      ) RETURNING id INTO transaction_id;
    ELSE
      UPDATE public.inventory_transactions
      SET sku = damage_row.sku,
          quantity = target_quantity,
          customer_name = COALESCE(supplier_name, customer_name, 'Damaged Goods'),
          customer_city = COALESCE(supplier_city, customer_city, ''),
          updated_at = now()
      WHERE id = transaction_id
        AND company_id = damage_row.company_id;
    END IF;

    INSERT INTO public.inventory (company_id, warehouse_id, sku, available, reserved)
    VALUES (damage_row.company_id, target_warehouse_id, damage_row.sku, -target_quantity, target_quantity)
    ON CONFLICT (warehouse_id, sku) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        available = public.inventory.available - target_quantity,
        reserved = public.inventory.reserved + target_quantity,
        updated_at = now();

    UPDATE public.damaged_goods
    SET inventory_transaction_id = transaction_id,
        reference_id = target_reference,
        inventory_reserved_at = now(),
        inventory_reserved_sku = damage_row.sku,
        inventory_reserved_warehouse_id = target_warehouse_id,
        inventory_reserved_quantity = target_quantity,
        updated_at = now()
    WHERE id = damage_row.id;

    changed := TRUE;
  END IF;

  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_damaged_goods_inventory(
  p_company_id UUID,
  p_warehouse_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  damage_id UUID;
  change_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = p_company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this company.';
  END IF;

  FOR damage_id IN
    SELECT d.id
    FROM public.damaged_goods d
    WHERE d.company_id = p_company_id
      AND d.archived_at IS NULL
      AND COALESCE(d.status, 'unpacked') = 'unpacked'
      AND d.inventory_reserved_at IS NULL
    ORDER BY d.created_at ASC
    LIMIT 200
  LOOP
    IF public.sync_damaged_goods_inventory(damage_id, p_warehouse_id) THEN
      change_count := change_count + 1;
    END IF;
  END LOOP;

  RETURN change_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_damaged_goods_record(p_damage_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  damage_row public.damaged_goods%ROWTYPE;
BEGIN
  SELECT * INTO damage_row
  FROM public.damaged_goods
  WHERE id = p_damage_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = damage_row.company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this damaged goods record.';
  END IF;

  IF damage_row.inventory_reserved_at IS NOT NULL THEN
    UPDATE public.damaged_goods SET status = 'customer_possession' WHERE id = p_damage_id;
    PERFORM public.sync_damaged_goods_inventory(p_damage_id, damage_row.inventory_reserved_warehouse_id);
  ELSIF damage_row.inventory_transaction_id IS NOT NULL THEN
    DELETE FROM public.inventory_transactions
    WHERE id = damage_row.inventory_transaction_id
      AND company_id = damage_row.company_id
      AND status = 'inspect';
  END IF;

  DELETE FROM public.damaged_goods WHERE id = p_damage_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_damaged_goods_inventory(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_damaged_goods_inventory(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_damaged_goods_record(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_damaged_goods_inventory(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_damaged_goods_inventory(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_damaged_goods_record(UUID) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 51_exclude_cancelled_from_warehouse_receive.sql
-- =========================================================================

-- Cancelled customer orders remain visible in All Orders but are not receivable stock.
CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  receive_count BIGINT,
  inspect_count BIGINT,
  pack_count BIGINT,
  dispatch_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_receive_count BIGINT := 0;
  v_inspect_count BIGINT := 0;
  v_pack_count BIGINT := 0;
  v_dispatch_count BIGINT := 0;
BEGIN
  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_inspect_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'reserved'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_pack_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'inspect'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_dispatch_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'packed'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_transactions other
      WHERE other.company_id = p_company_id
        AND other.reference_id = tx.reference_id
        AND other.status IN ('reserved', 'inspect')
        AND UPPER(TRIM(other.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
        AND other.sku NOT LIKE 'OC-%'
        AND other.sku NOT LIKE 'BJ-%'
    );

  SELECT
    (
      SELECT COUNT(*)
      FROM public.inventory_transactions tx
      WHERE tx.company_id = p_company_id
        AND (
          (p_warehouse_id IS NOT NULL AND tx.warehouse_id = p_warehouse_id)
          OR (p_warehouse_id IS NULL AND tx.warehouse_id IS NULL)
        )
        AND (
          tx.type <> 'customer_order'
          OR (
            tx.reference_id IS NOT NULL
            AND (
              tx.reference_id LIKE 'ORD-%'
              OR tx.reference_id LIKE 'OC-%'
              OR tx.reference_id LIKE 'RCV-%'
              OR tx.reference_id LIKE 'SND-%'
            )
          )
        )
        AND (
          (
            tx.reference_id IS NOT NULL
            AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
            AND tx.status IN ('ordered', 'dispatched')
            AND EXISTS (
              SELECT 1
              FROM public.delivery_bookings delivery
              WHERE delivery.company_id = p_company_id
                AND delivery.reference_id = tx.reference_id
            )
          )
          OR (
            (
              tx.reference_id IS NULL
              OR (tx.reference_id NOT LIKE 'RCV-%' AND tx.reference_id NOT LIKE 'SUP-%')
            )
            AND tx.status IN ('ordered', 'returned')
            AND tx.type <> 'supplier_order'
          )
        )
    )
    + (
      SELECT COUNT(*)
      FROM public.warehouse_transfers transfer
      WHERE transfer.company_id = p_company_id
        AND transfer.status = 'approved'
        AND transfer.to_warehouse_id = p_warehouse_id
    )
  INTO v_receive_count;

  RETURN QUERY SELECT
    COALESCE(v_receive_count, 0),
    COALESCE(v_inspect_count, 0),
    COALESCE(v_pack_count, 0),
    COALESCE(v_dispatch_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID)
  TO authenticated, service_role;


-- =========================================================================
-- SOURCE FILE: 51_inventory_cost_ledger.sql
-- =========================================================================

-- Add an isolated, auditable moving-average cost layer for COGS reporting.
-- Operational inventory statuses and quantity counters remain unchanged.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS average_unit_cost_centavos BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS ordered_unit_cost_centavos BIGINT,
  ADD COLUMN IF NOT EXISTS received_unit_cost_centavos BIGINT;

CREATE TABLE IF NOT EXISTS public.inventory_cost_ledger (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  inventory_transaction_id UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE CASCADE,
  reference_id TEXT,
  sku TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('cogs', 'cogs_reversal')),
  quantity INTEGER NOT NULL,
  unit_cost_centavos BIGINT NOT NULL DEFAULT 0,
  total_cost_centavos BIGINT NOT NULL DEFAULT 0,
  cost_method TEXT NOT NULL CHECK (cost_method IN ('moving_average', 'legacy_estimate', 'catalog_fallback', 'missing_cost')),
  recognized_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inventory_transaction_id, event_type)
);

ALTER TABLE public.inventory_cost_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_cost_ledger'
      AND policyname = 'Finance module inventory cost ledger'
  ) THEN
    CREATE POLICY "Finance module inventory cost ledger"
      ON public.inventory_cost_ledger
      FOR SELECT
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Finance'));
  END IF;
END;
$$;

REVOKE ALL ON public.inventory_cost_ledger FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_cost_ledger FROM authenticated;
GRANT SELECT ON public.inventory_cost_ledger TO authenticated, service_role;
GRANT ALL ON public.inventory_cost_ledger TO service_role;

CREATE INDEX IF NOT EXISTS idx_inventory_cost_ledger_company_recognized
  ON public.inventory_cost_ledger (company_id, recognized_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_ledger_company_sku_recognized
  ON public.inventory_cost_ledger (company_id, sku, recognized_at DESC);

CREATE OR REPLACE FUNCTION public.capture_inventory_order_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_company_id UUID;
BEGIN
  IF NEW.type <> 'supplier_order' OR NEW.ordered_unit_cost_centavos IS NOT NULL THEN
    RETURN NEW;
  END IF;

  resolved_company_id := NEW.company_id;
  IF resolved_company_id IS NULL AND NEW.warehouse_id IS NOT NULL THEN
    SELECT company.id
    INTO resolved_company_id
    FROM public.warehouses AS warehouse
    JOIN public.companies AS company ON company.tenant_id = warehouse.tenant_id
    WHERE warehouse.id = NEW.warehouse_id
    LIMIT 1;
  END IF;

  SELECT product.dealer_price
  INTO NEW.ordered_unit_cost_centavos
  FROM public.products AS product
  WHERE lower(product.sku) = lower(NEW.sku)
    AND (product.company_id = resolved_company_id OR product.company_id IS NULL)
  ORDER BY (product.company_id = resolved_company_id) DESC, product.updated_at DESC NULLS LAST
  LIMIT 1;

  NEW.ordered_unit_cost_centavos := COALESCE(NEW.ordered_unit_cost_centavos, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_inventory_order_cost
  ON public.inventory_transactions;

CREATE TRIGGER trg_capture_inventory_order_cost
BEFORE INSERT OR UPDATE OF status
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.capture_inventory_order_cost();

CREATE OR REPLACE FUNCTION public.record_inventory_cost_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_quantity BIGINT := 0;
  current_average BIGINT := 0;
  effective_unit_cost BIGINT := 0;
  effective_method TEXT := 'missing_cost';
  event_timestamp TIMESTAMPTZ;
BEGIN
  IF NEW.company_id IS NULL OR NEW.warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'supplier_order'
    AND NEW.status = 'received'
    AND OLD.status IS DISTINCT FROM 'received'
  THEN
    effective_unit_cost := COALESCE(
      NEW.received_unit_cost_centavos,
      NEW.ordered_unit_cost_centavos,
      0
    );

    SELECT inventory.available, inventory.average_unit_cost_centavos
    INTO current_quantity, current_average
    FROM public.inventory AS inventory
    WHERE inventory.company_id = NEW.company_id
      AND inventory.warehouse_id = NEW.warehouse_id
      AND lower(inventory.sku) = lower(NEW.sku)
    FOR UPDATE;

    IF FOUND AND NEW.quantity > 0 AND effective_unit_cost >= 0 THEN
      UPDATE public.inventory AS inventory
      SET average_unit_cost_centavos = CASE
            WHEN GREATEST(current_quantity, 0) + NEW.quantity > 0 THEN
              ROUND((GREATEST(current_quantity, 0) * current_average + NEW.quantity * effective_unit_cost)::NUMERIC
                / (GREATEST(current_quantity, 0) + NEW.quantity))::BIGINT
            ELSE effective_unit_cost
          END,
          updated_at = NOW()
      WHERE inventory.company_id = NEW.company_id
        AND inventory.warehouse_id = NEW.warehouse_id
        AND lower(inventory.sku) = lower(NEW.sku);
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.type = 'customer_order'
    AND NEW.status = 'received'
    AND OLD.status IS DISTINCT FROM 'received'
  THEN
    SELECT inventory.average_unit_cost_centavos
    INTO effective_unit_cost
    FROM public.inventory AS inventory
    WHERE inventory.company_id = NEW.company_id
      AND inventory.warehouse_id = NEW.warehouse_id
      AND lower(inventory.sku) = lower(NEW.sku)
    LIMIT 1;

    IF COALESCE(effective_unit_cost, 0) > 0 THEN
      effective_method := 'moving_average';
    ELSE
      SELECT product.dealer_price
      INTO effective_unit_cost
      FROM public.products AS product
      WHERE lower(product.sku) = lower(NEW.sku)
        AND (product.company_id = NEW.company_id OR product.company_id IS NULL)
      ORDER BY (product.company_id = NEW.company_id) DESC, product.updated_at DESC NULLS LAST
      LIMIT 1;

      IF COALESCE(effective_unit_cost, 0) > 0 THEN
        effective_method := 'catalog_fallback';
      ELSE
        effective_method := 'missing_cost';
      END IF;
    END IF;

    effective_unit_cost := COALESCE(effective_unit_cost, 0);
    event_timestamp := COALESCE(NEW.timestamp_received, NOW());

    INSERT INTO public.inventory_cost_ledger (
      company_id,
      warehouse_id,
      inventory_transaction_id,
      reference_id,
      sku,
      event_type,
      quantity,
      unit_cost_centavos,
      total_cost_centavos,
      cost_method,
      recognized_at
    ) VALUES (
      NEW.company_id,
      NEW.warehouse_id,
      NEW.id,
      NEW.reference_id,
      upper(NEW.sku),
      'cogs',
      NEW.quantity,
      effective_unit_cost,
      NEW.quantity * effective_unit_cost,
      effective_method,
      event_timestamp
    )
    ON CONFLICT (inventory_transaction_id, event_type) DO NOTHING;

    RETURN NEW;
  END IF;

  IF NEW.type = 'customer_order'
    AND NEW.status = 'returned'
    AND OLD.status IS DISTINCT FROM 'returned'
  THEN
    SELECT ledger.unit_cost_centavos
    INTO effective_unit_cost
    FROM public.inventory_cost_ledger AS ledger
    WHERE ledger.inventory_transaction_id = NEW.id
      AND ledger.event_type = 'cogs'
    LIMIT 1;

    effective_unit_cost := COALESCE(effective_unit_cost, 0);
    effective_method := CASE WHEN effective_unit_cost > 0 THEN 'moving_average' ELSE 'missing_cost' END;
    event_timestamp := COALESCE(NEW.timestamp_returned, NOW());

    INSERT INTO public.inventory_cost_ledger (
      company_id,
      warehouse_id,
      inventory_transaction_id,
      reference_id,
      sku,
      event_type,
      quantity,
      unit_cost_centavos,
      total_cost_centavos,
      cost_method,
      recognized_at
    ) VALUES (
      NEW.company_id,
      NEW.warehouse_id,
      NEW.id,
      NEW.reference_id,
      upper(NEW.sku),
      'cogs_reversal',
      -NEW.quantity,
      effective_unit_cost,
      -(NEW.quantity * effective_unit_cost),
      effective_method,
      event_timestamp
    )
    ON CONFLICT (inventory_transaction_id, event_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_inventory_cost_event
  ON public.inventory_transactions;

CREATE TRIGGER trg_record_inventory_cost_event
AFTER UPDATE OF status
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.record_inventory_cost_event();

REVOKE ALL ON FUNCTION public.capture_inventory_order_cost() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_inventory_cost_event() FROM PUBLIC;

-- Seed current inventory carrying costs without changing quantities or statuses.
UPDATE public.inventory AS inventory
SET average_unit_cost_centavos = COALESCE((
      SELECT product.dealer_price
      FROM public.products AS product
      WHERE lower(product.sku) = lower(inventory.sku)
        AND (product.company_id = inventory.company_id OR product.company_id IS NULL)
      ORDER BY (product.company_id = inventory.company_id) DESC, product.updated_at DESC NULLS LAST
      LIMIT 1
    ), 0),
    updated_at = NOW()
WHERE inventory.average_unit_cost_centavos = 0;

-- Preserve historical reporting with explicitly labeled estimated costs.
INSERT INTO public.inventory_cost_ledger (
  company_id,
  warehouse_id,
  inventory_transaction_id,
  reference_id,
  sku,
  event_type,
  quantity,
  unit_cost_centavos,
  total_cost_centavos,
  cost_method,
  recognized_at
)
SELECT
  transaction.company_id,
  transaction.warehouse_id,
  transaction.id,
  transaction.reference_id,
  upper(transaction.sku),
  'cogs',
  transaction.quantity,
  COALESCE(historical.cost, product.dealer_price, 0),
  transaction.quantity * COALESCE(historical.cost, product.dealer_price, 0),
  CASE
    WHEN COALESCE(historical.cost, product.dealer_price, 0) > 0 THEN 'legacy_estimate'
    ELSE 'missing_cost'
  END,
  COALESCE(transaction.timestamp_received, transaction.updated_at, transaction.created_at)
FROM public.inventory_transactions AS transaction
LEFT JOIN LATERAL (
  SELECT history.cost
  FROM public.product_cost_history AS history
  WHERE history.company_id = transaction.company_id
    AND lower(history.sku) = lower(transaction.sku)
    AND history.start_date <= COALESCE(transaction.timestamp_received, transaction.updated_at, transaction.created_at)
    AND (history.end_date IS NULL OR history.end_date >= COALESCE(transaction.timestamp_received, transaction.updated_at, transaction.created_at))
  ORDER BY history.start_date DESC, history.id DESC
  LIMIT 1
) AS historical ON TRUE
LEFT JOIN LATERAL (
  SELECT catalog.dealer_price
  FROM public.products AS catalog
  WHERE lower(catalog.sku) = lower(transaction.sku)
    AND (catalog.company_id = transaction.company_id OR catalog.company_id IS NULL)
  ORDER BY (catalog.company_id = transaction.company_id) DESC, catalog.updated_at DESC NULLS LAST
  LIMIT 1
) AS product ON TRUE
WHERE transaction.type = 'customer_order'
  AND transaction.status IN ('received', 'returned')
  AND transaction.company_id IS NOT NULL
  AND transaction.warehouse_id IS NOT NULL
ON CONFLICT (inventory_transaction_id, event_type) DO NOTHING;

UPDATE public.inventory_cost_ledger
SET cost_method = 'missing_cost'
WHERE cost_method = 'legacy_estimate'
  AND unit_cost_centavos = 0;

INSERT INTO public.inventory_cost_ledger (
  company_id,
  warehouse_id,
  inventory_transaction_id,
  reference_id,
  sku,
  event_type,
  quantity,
  unit_cost_centavos,
  total_cost_centavos,
  cost_method,
  recognized_at
)
SELECT
  transaction.company_id,
  transaction.warehouse_id,
  transaction.id,
  transaction.reference_id,
  upper(transaction.sku),
  'cogs_reversal',
  -transaction.quantity,
  original.unit_cost_centavos,
  -(transaction.quantity * original.unit_cost_centavos),
  'legacy_estimate',
  COALESCE(transaction.timestamp_returned, transaction.updated_at, transaction.created_at)
FROM public.inventory_transactions AS transaction
JOIN public.inventory_cost_ledger AS original
  ON original.inventory_transaction_id = transaction.id
 AND original.event_type = 'cogs'
WHERE transaction.type = 'customer_order'
  AND transaction.status = 'returned'
  AND transaction.company_id IS NOT NULL
ON CONFLICT (inventory_transaction_id, event_type) DO NOTHING;


-- =========================================================================
-- SOURCE FILE: 52_align_warehouse_badges_with_inventory_flags.sql
-- =========================================================================

-- Keep warehouse badge counts aligned with queues that exclude non-stock products.
CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  receive_count BIGINT,
  inspect_count BIGINT,
  pack_count BIGINT,
  dispatch_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_receive_count BIGINT := 0;
  v_inspect_count BIGINT := 0;
  v_pack_count BIGINT := 0;
  v_dispatch_count BIGINT := 0;
BEGIN
  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_inspect_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'reserved'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id
        AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_pack_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'inspect'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id
        AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_dispatch_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'packed'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id
        AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_transactions other
      WHERE other.company_id = p_company_id
        AND other.reference_id = tx.reference_id
        AND other.status IN ('reserved', 'inspect')
        AND UPPER(TRIM(other.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
        AND other.sku NOT LIKE 'OC-%'
        AND other.sku NOT LIKE 'BJ-%'
        AND NOT EXISTS (
          SELECT 1 FROM public.products product
          WHERE product.company_id = other.company_id
            AND product.sku = other.sku
            AND product.count_inventory = false
        )
    );

  SELECT
    (
      SELECT COUNT(*)
      FROM public.inventory_transactions tx
      WHERE tx.company_id = p_company_id
        AND (
          (p_warehouse_id IS NOT NULL AND tx.warehouse_id = p_warehouse_id)
          OR (p_warehouse_id IS NULL AND tx.warehouse_id IS NULL)
        )
        AND (
          tx.type <> 'customer_order'
          OR (
            tx.reference_id IS NOT NULL
            AND (
              tx.reference_id LIKE 'ORD-%'
              OR tx.reference_id LIKE 'OC-%'
              OR tx.reference_id LIKE 'RCV-%'
              OR tx.reference_id LIKE 'SND-%'
            )
          )
        )
        AND (
          (
            tx.reference_id IS NOT NULL
            AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
            AND tx.status IN ('ordered', 'dispatched')
            AND EXISTS (
              SELECT 1
              FROM public.delivery_bookings delivery
              WHERE delivery.company_id = p_company_id
                AND delivery.reference_id = tx.reference_id
            )
          )
          OR (
            (
              tx.reference_id IS NULL
              OR (tx.reference_id NOT LIKE 'RCV-%' AND tx.reference_id NOT LIKE 'SUP-%')
            )
            AND tx.status IN ('ordered', 'returned')
            AND tx.type <> 'supplier_order'
          )
        )
    )
    + (
      SELECT COUNT(*)
      FROM public.warehouse_transfers transfer
      WHERE transfer.company_id = p_company_id
        AND transfer.status = 'approved'
        AND transfer.to_warehouse_id = p_warehouse_id
    )
  INTO v_receive_count;

  RETURN QUERY SELECT
    COALESCE(v_receive_count, 0),
    COALESCE(v_inspect_count, 0),
    COALESCE(v_pack_count, 0),
    COALESCE(v_dispatch_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID)
  TO authenticated, service_role;


-- =========================================================================
-- SOURCE FILE: 62_restore_damaged_goods_quantity.sql
-- =========================================================================

-- Restore the quantity column expected by the damaged-goods inventory RPCs.
-- Existing records remain single-item records through the default value.

ALTER TABLE public.damaged_goods
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_warehouse_sku_unique
  ON public.inventory (warehouse_id, sku);

-- Recreate functions that compiled a damaged_goods %ROWTYPE before the live
-- table reached its current shape. Replacing them invalidates the stale record
-- descriptor without changing their business logic or permissions.
DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.sync_damaged_goods_inventory(uuid,uuid)'::regprocedure
  ) INTO function_sql;
  function_sql := replace(
    function_sql,
    'FROM public.warehouses w
    WHERE w.id = target_warehouse_id
      AND w.company_id = damage_row.company_id',
    'FROM public.warehouses w
    JOIN public.companies c ON c.tenant_id = w.tenant_id
    WHERE w.id = target_warehouse_id
      AND c.id = damage_row.company_id'
  );
  function_sql := replace(
    function_sql,
    'ON CONFLICT (company_id, warehouse_id, sku) DO UPDATE
    SET available = public.inventory.available + EXCLUDED.available,',
    'ON CONFLICT (warehouse_id, sku) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        available = public.inventory.available + EXCLUDED.available,'
  );
  function_sql := replace(
    function_sql,
    'ON CONFLICT (company_id, warehouse_id, sku) DO UPDATE
    SET available = public.inventory.available - target_quantity,',
    'ON CONFLICT (warehouse_id, sku) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        available = public.inventory.available - target_quantity,'
  );
  EXECUTE function_sql;

  SELECT pg_get_functiondef(
    'public.delete_damaged_goods_record(uuid)'::regprocedure
  ) INTO function_sql;
  EXECUTE function_sql;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- =========================================================================
-- SOURCE FILE: 66_pricing_tier_cycle_days.sql
-- =========================================================================

ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS cycle_days INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pricing_tiers_cycle_days_positive'
      AND conrelid = 'public.pricing_tiers'::regclass
  ) THEN
ALTER TABLE public.pricing_tiers
      ADD CONSTRAINT pricing_tiers_cycle_days_positive
      CHECK (cycle_days IS NULL OR cycle_days > 0);
  END IF;
END $$;


-- =========================================================================
-- SOURCE FILE: 67_public_subscription_requests.sql
-- =========================================================================

-- Platform-level leads are intentionally not tenant-owned: they are created
-- before a company or tenant exists. Only the service-role API may access them.
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_tier_id UUID NOT NULL REFERENCES public.pricing_tiers(id) ON DELETE RESTRICT,
  plan_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  business_email TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  company_name TEXT NOT NULL,
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL,
  country TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'converted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.subscription_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.subscription_requests TO service_role;

CREATE INDEX IF NOT EXISTS subscription_requests_email_plan_created_idx
  ON public.subscription_requests (business_email, pricing_tier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_requests_status_created_idx
  ON public.subscription_requests (status, created_at DESC);


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_products_company_ownership.sql
-- =========================================================================

-- Ensure every product has explicit company ownership so catalog records can
-- never appear through a legacy NULL-owner compatibility query.

DO $$
DECLARE
  brightkey_company_id CONSTANT UUID := 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = brightkey_company_id
      AND name = 'BrightKey'
  ) THEN
    RAISE EXCEPTION 'Expected BrightKey company was not found; product ownership was not changed.';
  END IF;

  UPDATE public.products
  SET company_id = brightkey_company_id
  WHERE id IN (
    '4b25f102-aa2b-477b-8dc0-065f787222ae',
    'c2e6fd99-7fe7-49be-a879-824f16c51174'
  )
    AND sku IN ('OCULAR', 'ADD-ON LABOR')
    AND company_id IS NULL;

  IF EXISTS (SELECT 1 FROM public.products WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Products with missing company ownership remain; NOT NULL was not applied.';
  END IF;
END
$$;

ALTER TABLE public.products
  ALTER COLUMN company_id SET NOT NULL;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260808_restore_brightkey_catalog_specifications.sql
-- =========================================================================

-- Restore the legacy BrightKey catalog specifications after specification
-- definitions became company-scoped. Other tenants intentionally remain empty.

DO $$
DECLARE
  brightkey_company_id CONSTANT UUID := 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = brightkey_company_id
      AND name = 'BrightKey'
  ) THEN
    RAISE EXCEPTION 'Expected BrightKey company was not found; catalog specifications were not restored.';
  END IF;

  INSERT INTO public.global_settings (company_id, key, value, updated_at)
  VALUES (
    brightkey_company_id,
    'catalog_spec_definitions',
    jsonb_build_object(
      'definitions',
      jsonb_build_array(
        jsonb_build_object('id', 'model', 'label', 'Model', 'field', 'spec_model', 'source', 'column', 'placeholder', 'e.g. A04-TT'),
        jsonb_build_object('id', 'color', 'label', 'Color', 'field', 'spec_color', 'source', 'column', 'placeholder', 'e.g. Matte Black, Silver'),
        jsonb_build_object('id', 'weight', 'label', 'Weight', 'field', 'spec_weight', 'source', 'column', 'placeholder', 'e.g. 2.5 kg'),
        jsonb_build_object('id', 'operating_temperature', 'label', 'Operating Temperature', 'field', 'spec_operating_temperature', 'source', 'column', 'placeholder', 'e.g. -20°C to 60°C'),
        jsonb_build_object('id', 'warranty', 'label', 'Warranty', 'field', 'spec_warranty', 'source', 'column', 'placeholder', 'e.g. 1 Year'),
        jsonb_build_object('id', 'support', 'label', 'Technical Support', 'field', 'spec_support', 'source', 'column', 'placeholder', 'e.g. Lifetime, 2 Years'),
        jsonb_build_object('id', 'material', 'label', 'Material', 'field', 'spec_material', 'source', 'column', 'placeholder', 'e.g. Aluminum Alloy'),
        jsonb_build_object('id', 'voltage', 'label', 'Voltage', 'field', 'spec_voltage', 'source', 'column', 'placeholder', 'e.g. DC 6V'),
        jsonb_build_object('id', 'dimension', 'label', 'Dimension', 'field', 'spec_dimension', 'source', 'column', 'placeholder', 'e.g. 350 x 75 x 30 mm')
      )
    ),
    NOW()
  )
  ON CONFLICT (key, company_id) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW()
  WHERE COALESCE(
    jsonb_array_length(
      CASE
        WHEN jsonb_typeof(public.global_settings.value->'definitions') = 'array'
          THEN public.global_settings.value->'definitions'
        ELSE '[]'::jsonb
      END
    ),
    0
  ) = 0;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260808_supplier_additional_payment_methods.sql
-- =========================================================================

-- Allow each tenant-owned supplier to keep additional bank details and QR codes.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_payment_methods_is_array;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_payment_methods_is_array
  CHECK (jsonb_typeof(payment_methods) = 'array');

COMMENT ON COLUMN public.suppliers.payment_methods IS
  'Additional supplier payment entries. Each item is an info or qr record; ownership is inherited from the supplier company_id and protected by suppliers RLS.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_allow_public_catalog_spec_definitions.sql
-- =========================================================================

-- Product cards need the company-scoped specification labels and preview-card
-- selections. No other company setting is exposed by this policy change.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'global_settings'
      AND policyname = 'Allow public storefront settings read'
  ) THEN
    ALTER POLICY "Allow public storefront settings read"
      ON public.global_settings
      TO anon
      USING (key IN (
        'free_shipping',
        'free_gifts',
        'upsell_cross_sell',
        'delivery_lead_time',
        'promo_popup',
        'invoice_template',
        'catalog_spec_definitions'
      ));
  ELSE
    CREATE POLICY "Allow public storefront settings read"
      ON public.global_settings
      FOR SELECT
      TO anon
      USING (key IN (
        'free_shipping',
        'free_gifts',
        'upsell_cross_sell',
        'delivery_lead_time',
        'promo_popup',
        'invoice_template',
        'catalog_spec_definitions'
      ));
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819004033_reconcile_a12_duplicate_reservations.sql
-- =========================================================================

-- Four failed invoice-save attempts reserved the same one-unit A12 TT item
-- before the booking update failed. The later cancellation restored reserved
-- but not available, leaving this exact warehouse row understated by four.
-- Snapshot guards make the correction rerunnable and prevent it from touching
-- a row whose inventory state has changed since the incident audit.

UPDATE public.inventory AS inventory
SET
  available = inventory.available + 4,
  updated_at = NOW()
WHERE inventory.id = 'b36b5136-2c79-4021-9774-f9b4af892277'::UUID
  AND inventory.warehouse_id = '23e0710e-edfe-455f-a0ef-74df6749687b'::UUID
  AND upper(trim(inventory.sku)) = 'A12 TT'
  AND inventory.available = 3
  AND inventory.reserved = 0
  AND inventory.cancelled = 4
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_transactions AS transaction
    WHERE transaction.reference_id = 'ORD-20260815-040'
      AND transaction.warehouse_id = inventory.warehouse_id
      AND upper(trim(transaction.sku)) = 'A12 TT'
      AND transaction.type = 'customer_order'
      AND transaction.status IN ('reserved', 'inspect', 'packed', 'dispatched')
  );


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819010000_restore_ord_20260815_040_inspect_reservation.sql
-- =========================================================================

-- The duplicate-reservation cleanup for this order cancelled all four A12 TT
-- rows. Restore the earliest row as the one legitimate reservation so the
-- order returns to Warehouse Inspect, while keeping the three retries cancelled.

DO $$
DECLARE
  target_inventory public.inventory%ROWTYPE;
  cancelled_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_transactions
    WHERE reference_id = 'ORD-20260815-040'
      AND warehouse_id = '23e0710e-edfe-455f-a0ef-74df6749687b'::UUID
      AND upper(trim(sku)) = 'A12 TT'
      AND type = 'customer_order'
      AND status IN ('reserved', 'inspect', 'packed', 'dispatched')
  ) THEN
    RETURN;
  END IF;

  SELECT *
  INTO target_inventory
  FROM public.inventory
  WHERE id = 'b36b5136-2c79-4021-9774-f9b4af892277'::UUID
  FOR UPDATE;

  SELECT count(*)
  INTO cancelled_count
  FROM public.inventory_transactions
  WHERE reference_id = 'ORD-20260815-040'
    AND warehouse_id = '23e0710e-edfe-455f-a0ef-74df6749687b'::UUID
    AND upper(trim(sku)) = 'A12 TT'
    AND type = 'customer_order'
    AND status = 'cancelled';

  IF target_inventory.id IS NULL
     OR target_inventory.available <> 7
     OR target_inventory.reserved <> 0
     OR target_inventory.cancelled <> 4
     OR cancelled_count <> 4 THEN
    RAISE EXCEPTION 'Incident inventory state changed; refusing automatic repair';
  END IF;

  UPDATE public.inventory_transactions
  SET
    status = 'reserved',
    timestamp_cancelled = NULL,
    updated_at = NOW()
  WHERE id = 'c3287276-3d8b-4034-a39a-7603321a3784'::UUID
    AND status = 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident transaction is unavailable; refusing automatic repair';
  END IF;

  UPDATE public.inventory
  SET
    available = available - 1,
    reserved = reserved + 1,
    updated_at = NOW()
  WHERE id = target_inventory.id;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819012000_prevent_duplicate_active_customer_order_reservations.sql
-- =========================================================================

-- Prevent future duplicate active reservation rows even when a caller bypasses
-- the atomic reservation RPC. Existing historical duplicates remain untouched.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_customer_order_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.type <> 'customer_order'
     OR NEW.status NOT IN ('reserved', 'inspect', 'packed', 'dispatched') THEN
    RETURN NEW;
  END IF;

  -- Allow an existing active row to advance through the workflow. This keeps
  -- historical duplicate rows operable while preventing new active duplicates.
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('reserved', 'inspect', 'packed', 'dispatched')
     AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id
     AND OLD.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
     AND OLD.reference_id IS NOT DISTINCT FROM NEW.reference_id
     AND upper(trim(OLD.sku)) IS NOT DISTINCT FROM upper(trim(NEW.sku))
     AND OLD.type IS NOT DISTINCT FROM NEW.type THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    concat_ws(
      ':',
      COALESCE(NEW.company_id::TEXT, ''),
      COALESCE(NEW.warehouse_id::TEXT, ''),
      COALESCE(NEW.reference_id, ''),
      upper(trim(COALESCE(NEW.sku, ''))),
      NEW.type
    ),
    0
  ));

  IF EXISTS (
    SELECT 1
    FROM public.inventory_transactions AS existing
    WHERE existing.id IS DISTINCT FROM NEW.id
      AND existing.company_id IS NOT DISTINCT FROM NEW.company_id
      AND existing.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
      AND existing.reference_id = NEW.reference_id
      AND upper(trim(existing.sku)) = upper(trim(NEW.sku))
      AND existing.type = 'customer_order'
      AND existing.status IN ('reserved', 'inspect', 'packed', 'dispatched')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'An active reservation already exists for this order and SKU.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_active_customer_order_reservation
  ON public.inventory_transactions;

CREATE TRIGGER prevent_duplicate_active_customer_order_reservation
BEFORE INSERT OR UPDATE OF company_id, warehouse_id, reference_id, sku, type, status
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_active_customer_order_reservation();


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260820030000_align_inventory_reservation_conflict_target.sql
-- =========================================================================

-- Align the customer-order reservation RPC with the live inventory identity.
-- Warehouse UUIDs are globally unique, so warehouse_id + sku is authoritative.
-- The stale company_id + warehouse_id + sku conflict target did not catch the
-- live inventory_warehouse_sku_unique constraint and caused HTTP 409 responses.

DO $$
DECLARE
  function_sql TEXT;
  corrected_sql TEXT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reserve_customer_order_inventory(uuid,uuid,text,text,text,timestamptz,jsonb)'::regprocedure
  )
  INTO function_sql;

  corrected_sql := replace(
    function_sql,
    'ON CONFLICT (company_id, warehouse_id, sku)
    DO UPDATE SET
      available = public.inventory.available - EXCLUDED.reserved,',
    'ON CONFLICT (warehouse_id, sku)
    DO UPDATE SET
      company_id = EXCLUDED.company_id,
      available = public.inventory.available - EXCLUDED.reserved,'
  );

  IF corrected_sql = function_sql THEN
    IF position('ON CONFLICT (warehouse_id, sku)' IN function_sql) > 0 THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'reserve_customer_order_inventory conflict target was not recognized';
  END IF;

  EXECUTE corrected_sql;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260821070000_validate_products_against_tenant_businesses.sql
-- =========================================================================

-- Product business keys come from each company's configured tenant businesses.
-- Replace the legacy four-value constraint with tenant-scoped validation.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_business_check;

CREATE OR REPLACE FUNCTION public.validate_product_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.business IS NOT DISTINCT FROM OLD.business THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_businesses AS business
    WHERE business.company_id = NEW.company_id
      AND lower(regexp_replace(business.name, '[[:space:]_.-]+', '_', 'g')) = NEW.business
  ) THEN
    RAISE EXCEPTION 'Select a business configured for this company.'
      USING ERRCODE = '23514',
            CONSTRAINT = 'products_business_company_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_product_business_trigger ON public.products;
CREATE TRIGGER validate_product_business_trigger
  BEFORE INSERT OR UPDATE OF company_id, business ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_business();
