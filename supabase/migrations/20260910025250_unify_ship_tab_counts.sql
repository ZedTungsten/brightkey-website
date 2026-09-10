CREATE OR REPLACE FUNCTION public.get_ship_tab_counts(p_company_id uuid)
RETURNS TABLE(send_count bigint, receive_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT public.has_module_access((SELECT auth.uid()), p_company_id, 'Logistics') THEN
    RAISE EXCEPTION 'Ship tab counts are not available for this company.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH booking_candidates AS (
    SELECT
      booking.order_no,
      booking.status AS booking_status,
      booking.product_skus,
      COUNT(tx.id) AS transaction_count,
      COUNT(tx.id) FILTER (
        WHERE tx.timestamp_cancelled IS NULL
          AND tx.status <> 'cancelled'
          AND NOT EXISTS (
            SELECT 1
            FROM public.products AS product
            WHERE (product.company_id = p_company_id OR product.company_id IS NULL)
              AND product.sku = tx.sku
              AND LOWER(TRIM(product.category)) = 'service'
          )
      ) AS visible_transaction_count,
      MAX(CASE tx.status
        WHEN 'scheduled' THEN 0
        WHEN 'confirmed' THEN 1
        WHEN 'ordered' THEN 2
        WHEN 'reserved' THEN 3
        WHEN 'inspect' THEN 4
        WHEN 'packed' THEN 5
        WHEN 'dispatched' THEN 6
        WHEN 'in_progress' THEN 7
        WHEN 'received' THEN 8
        WHEN 'completed' THEN 9
        WHEN 'returned' THEN 10
        ELSE -1
      END) FILTER (
        WHERE tx.timestamp_cancelled IS NULL
          AND tx.status <> 'cancelled'
          AND NOT EXISTS (
            SELECT 1
            FROM public.products AS product
            WHERE (product.company_id = p_company_id OR product.company_id IS NULL)
              AND product.sku = tx.sku
              AND LOWER(TRIM(product.category)) = 'service'
          )
      ) AS latest_transaction_rank
    FROM public.installation_bookings AS booking
    LEFT JOIN public.inventory_transactions AS tx
      ON tx.company_id = p_company_id
      AND tx.reference_id = booking.order_no
      AND tx.type IN ('customer_order', 'supplier_order')
    WHERE booking.company_id = p_company_id
      AND booking.order_no IS NOT NULL
      AND booking.order_no NOT LIKE 'OC-%'
      AND booking.order_no NOT LIKE 'DO-%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.delivery_bookings AS delivery
        WHERE delivery.company_id = p_company_id
          AND delivery.reference_id = booking.order_no
      )
    GROUP BY booking.order_no, booking.status, booking.product_skus
  ),
  visible_send_bookings AS (
    SELECT candidate.order_no
    FROM booking_candidates AS candidate
    WHERE (
      (candidate.transaction_count > 0 AND candidate.visible_transaction_count > 0)
      OR (
        candidate.transaction_count = 0
        AND EXISTS (
          SELECT 1
          FROM unnest(string_to_array(COALESCE(candidate.product_skus, ''), '|')) AS saved_sku
          WHERE TRIM(saved_sku) <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM public.products AS product
              WHERE (product.company_id = p_company_id OR product.company_id IS NULL)
                AND product.sku = TRIM(saved_sku)
                AND LOWER(TRIM(product.category)) = 'service'
            )
        )
      )
    )
      AND COALESCE(candidate.latest_transaction_rank, CASE candidate.booking_status
        WHEN 'received' THEN 8
        WHEN 'completed' THEN 9
        WHEN 'cancelled' THEN 11
        ELSE 0
      END) NOT IN (8, 9, 11)
  ),
  visible_receive_orders AS (
    SELECT DISTINCT tx.reference_id
    FROM public.inventory_transactions AS tx
    WHERE tx.company_id = p_company_id
      AND tx.status = 'ordered'
      AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
      AND NOT EXISTS (
        SELECT 1
        FROM public.delivery_bookings AS delivery
        WHERE delivery.company_id = p_company_id
          AND delivery.reference_id = tx.reference_id
      )
  )
  SELECT
    (SELECT COUNT(DISTINCT order_no) FROM visible_send_bookings),
    (SELECT COUNT(*) FROM visible_receive_orders);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ship_tab_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ship_tab_counts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ship_tab_counts(uuid) TO authenticated;
