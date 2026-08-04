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
