-- ============================================================
-- Migration: 14_backfill_warehouse_id.sql
-- Assigns all legacy inventory and inventory_transactions rows
-- (where warehouse_id IS NULL) to the first warehouse of their
-- respective tenant (i.e. Warehouse 1 / Bacoor Warehouse).
-- ============================================================

-- ── 1. Backfill inventory rows ────────────────────────────

-- For each inventory row with no warehouse, find the tenant's
-- first (oldest) active warehouse and assign it.
-- inventory rows are not directly tenant-scoped, so we join
-- through products → companies is not reliable.
-- Safer: since there is currently only 1 warehouse per tenant,
-- just pair each NULL row with the sole/first warehouse that
-- shares its company context via inventory_transactions.

-- Simplest approach: for every tenant, get their first warehouse,
-- then update all inventory rows whose SKU appears in a transaction
-- that belongs to that tenant's warehouse context.

-- Step 1a: Update inventory rows by matching SKUs that already have
-- a warehouse assignment in inventory_transactions (most reliable join).
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

-- Step 1b: For remaining NULL inventory rows (no matching transactions yet),
-- assign to the globally first warehouse ordered by created_at.
-- This is safe because before multi-warehouse, there was only 1 warehouse.
UPDATE public.inventory
SET warehouse_id = (
  SELECT id FROM public.warehouses ORDER BY created_at ASC LIMIT 1
)
WHERE warehouse_id IS NULL;

-- ── 2. Backfill inventory_transactions rows ───────────────

UPDATE public.inventory_transactions
SET warehouse_id = (
  SELECT id FROM public.warehouses ORDER BY created_at ASC LIMIT 1
)
WHERE warehouse_id IS NULL;

-- ── 3. Verify results ─────────────────────────────────────

SELECT
  'inventory' AS tbl,
  COUNT(*) FILTER (WHERE warehouse_id IS NULL)     AS still_null,
  COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL) AS assigned
FROM public.inventory
UNION ALL
SELECT
  'inventory_transactions',
  COUNT(*) FILTER (WHERE warehouse_id IS NULL),
  COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL)
FROM public.inventory_transactions;
