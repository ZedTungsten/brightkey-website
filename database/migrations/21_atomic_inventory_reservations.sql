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
