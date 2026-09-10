CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(receive_count bigint, inspect_count bigint, pack_count bigint, dispatch_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT public.has_module_access((SELECT auth.uid()), p_company_id, 'Logistics') THEN
    RAISE EXCEPTION 'Warehouse tab counts are not available for this company.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped_transactions AS (
    SELECT tx.*
    FROM public.inventory_transactions AS tx
    WHERE tx.company_id = p_company_id
      AND ((p_warehouse_id IS NOT NULL AND tx.warehouse_id = p_warehouse_id)
        OR (p_warehouse_id IS NULL AND tx.warehouse_id IS NULL))
  ),
  inventory_order_transactions AS (
    SELECT tx.*
    FROM scoped_transactions AS tx
    WHERE tx.type = 'customer_order'
      AND tx.reference_id IS NOT NULL
      AND tx.reference_id NOT LIKE 'SND-DMG-%'
      AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
      AND tx.sku NOT LIKE 'OC-%'
      AND tx.sku NOT LIKE 'BJ-%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.products AS product
        WHERE product.company_id = p_company_id
          AND product.sku = tx.sku
          AND product.count_inventory = false
      )
  ),
  queue_counts AS (
    SELECT
      COUNT(DISTINCT tx.reference_id) FILTER (
        WHERE tx.status = 'reserved'
          AND NOT EXISTS (
            SELECT 1
            FROM public.installation_bookings AS booking
            WHERE booking.company_id = p_company_id
              AND booking.order_no = tx.reference_id
          )
      ) AS inspect_count,
      COUNT(DISTINCT tx.reference_id) FILTER (
        WHERE tx.status = 'inspect'
          OR (tx.status = 'reserved' AND EXISTS (
            SELECT 1
            FROM public.installation_bookings AS booking
            WHERE booking.company_id = p_company_id
              AND booking.order_no = tx.reference_id
          ))
      ) AS pack_count,
      COUNT(DISTINCT tx.reference_id) FILTER (
        WHERE tx.status = 'packed'
          AND tx.timestamp_dispatched IS NULL
          AND tx.timestamp_received IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM inventory_order_transactions AS other
            WHERE other.reference_id = tx.reference_id
              AND other.status IN ('reserved', 'inspect')
          )
      ) AS dispatch_count
    FROM inventory_order_transactions AS tx
  )
  SELECT
    (
      SELECT COUNT(*)
      FROM scoped_transactions AS tx
      WHERE tx.status = 'unreceived'
        OR (
          tx.reference_id IS NOT NULL
          AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
          AND tx.status IN ('ordered', 'dispatched')
          AND EXISTS (
            SELECT 1
            FROM public.delivery_bookings AS delivery
            WHERE delivery.company_id = p_company_id
              AND delivery.reference_id = tx.reference_id
          )
        )
        OR (
          (tx.reference_id IS NULL
            OR (tx.reference_id NOT LIKE 'RCV-%' AND tx.reference_id NOT LIKE 'SUP-%'))
          AND tx.status IN ('ordered', 'returned')
          AND tx.type <> 'supplier_order'
        )
    ) + (
      SELECT COUNT(*)
      FROM public.warehouse_transfers AS transfer
      WHERE transfer.company_id = p_company_id
        AND transfer.status = 'approved'
        AND transfer.to_warehouse_id IS NOT DISTINCT FROM p_warehouse_id
    ),
    COALESCE(queue_counts.inspect_count, 0),
    COALESCE(queue_counts.pack_count, 0),
    COALESCE(queue_counts.dispatch_count, 0)
  FROM queue_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_warehouse_tab_counts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_warehouse_tab_counts(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_warehouse_tab_counts(uuid, uuid) TO authenticated;
