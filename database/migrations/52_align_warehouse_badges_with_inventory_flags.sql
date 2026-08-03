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
