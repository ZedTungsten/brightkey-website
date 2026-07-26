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
