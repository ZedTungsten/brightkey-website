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
