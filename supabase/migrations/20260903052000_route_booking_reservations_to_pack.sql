CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(receive_count bigint, inspect_count bigint, pack_count bigint, dispatch_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts record;
BEGIN
  SELECT
    COUNT(DISTINCT tx.reference_id) FILTER (
      WHERE tx.status = 'reserved'
        AND NOT EXISTS (
          SELECT 1 FROM public.installation_bookings booking
          WHERE booking.company_id = p_company_id AND booking.order_no = tx.reference_id
        )
    ) AS inspect_count,
    COUNT(DISTINCT tx.reference_id) FILTER (
      WHERE tx.status = 'inspect'
        OR (tx.status = 'reserved' AND EXISTS (
          SELECT 1 FROM public.installation_bookings booking
          WHERE booking.company_id = p_company_id AND booking.order_no = tx.reference_id
        ))
    ) AS pack_count,
    COUNT(DISTINCT tx.reference_id) FILTER (
      WHERE tx.status = 'packed'
        AND NOT EXISTS (
          SELECT 1 FROM public.inventory_transactions other
          WHERE other.company_id = p_company_id
            AND other.reference_id = tx.reference_id
            AND other.status IN ('reserved', 'inspect')
            AND UPPER(TRIM(other.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
            AND other.sku NOT LIKE 'OC-%' AND other.sku NOT LIKE 'BJ-%'
            AND NOT EXISTS (
              SELECT 1 FROM public.products product
              WHERE product.company_id = other.company_id AND product.sku = other.sku
                AND product.count_inventory = false
            )
        )
    ) AS dispatch_count
  INTO v_counts
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status IN ('reserved', 'inspect', 'packed')
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%' AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM public.inventory_transactions tx
     WHERE tx.company_id = p_company_id
       AND ((p_warehouse_id IS NOT NULL AND tx.warehouse_id = p_warehouse_id)
         OR (p_warehouse_id IS NULL AND tx.warehouse_id IS NULL))
       AND (tx.type <> 'customer_order' OR (tx.reference_id IS NOT NULL AND
         (tx.reference_id LIKE 'ORD-%' OR tx.reference_id LIKE 'OC-%'
          OR tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SND-%')))
       AND ((tx.reference_id IS NOT NULL
             AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
             AND tx.status IN ('ordered', 'dispatched')
             AND EXISTS (SELECT 1 FROM public.delivery_bookings delivery
                         WHERE delivery.company_id = p_company_id
                           AND delivery.reference_id = tx.reference_id))
         OR ((tx.reference_id IS NULL
              OR (tx.reference_id NOT LIKE 'RCV-%' AND tx.reference_id NOT LIKE 'SUP-%'))
             AND tx.status IN ('ordered', 'returned') AND tx.type <> 'supplier_order')))
    +
    (SELECT COUNT(*) FROM public.warehouse_transfers transfer
     WHERE transfer.company_id = p_company_id AND transfer.status = 'approved'
       AND transfer.to_warehouse_id = p_warehouse_id),
    COALESCE(v_counts.inspect_count, 0),
    COALESCE(v_counts.pack_count, 0),
    COALESCE(v_counts.dispatch_count, 0);
END;
$function$;
