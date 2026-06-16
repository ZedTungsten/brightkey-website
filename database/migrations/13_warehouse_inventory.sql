-- ============================================================
-- Migration: 13_warehouse_inventory.sql
-- Adds warehouse_id to inventory and inventory_transactions so
-- each warehouse tracks its own independent stock levels.
-- ============================================================

-- ── 1. Add warehouse_id to inventory ──────────────────────

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- For existing rows, leave warehouse_id as NULL (legacy/unassigned)
-- The app will filter by warehouse_id IS NOT DISTINCT FROM :warehouseId

CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_id
  ON public.inventory(warehouse_id);

-- Composite unique: one row per (warehouse_id, sku)
-- Drop old unique constraint on sku only if it exists, then add composite
DO $$
BEGIN
  -- Add composite unique constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_warehouse_sku_unique'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_warehouse_sku_unique UNIQUE (warehouse_id, sku);
  END IF;
END $$;

-- ── 2. Add warehouse_id to inventory_transactions ──────────

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse_id
  ON public.inventory_transactions(warehouse_id);
