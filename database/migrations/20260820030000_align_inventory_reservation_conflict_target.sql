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
