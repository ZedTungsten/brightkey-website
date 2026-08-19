-- The duplicate-reservation cleanup for this order cancelled all four A12 TT
-- rows. Restore the earliest row as the one legitimate reservation so the
-- order returns to Warehouse Inspect, while keeping the three retries cancelled.

DO $$
DECLARE
  target_inventory public.inventory%ROWTYPE;
  cancelled_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_transactions
    WHERE reference_id = 'ORD-20260815-040'
      AND warehouse_id = '23e0710e-edfe-455f-a0ef-74df6749687b'::UUID
      AND upper(trim(sku)) = 'A12 TT'
      AND type = 'customer_order'
      AND status IN ('reserved', 'inspect', 'packed', 'dispatched')
  ) THEN
    RETURN;
  END IF;

  SELECT *
  INTO target_inventory
  FROM public.inventory
  WHERE id = 'b36b5136-2c79-4021-9774-f9b4af892277'::UUID
  FOR UPDATE;

  SELECT count(*)
  INTO cancelled_count
  FROM public.inventory_transactions
  WHERE reference_id = 'ORD-20260815-040'
    AND warehouse_id = '23e0710e-edfe-455f-a0ef-74df6749687b'::UUID
    AND upper(trim(sku)) = 'A12 TT'
    AND type = 'customer_order'
    AND status = 'cancelled';

  IF target_inventory.id IS NULL
     OR target_inventory.available <> 7
     OR target_inventory.reserved <> 0
     OR target_inventory.cancelled <> 4
     OR cancelled_count <> 4 THEN
    RAISE EXCEPTION 'Incident inventory state changed; refusing automatic repair';
  END IF;

  UPDATE public.inventory_transactions
  SET
    status = 'reserved',
    timestamp_cancelled = NULL,
    updated_at = NOW()
  WHERE id = 'c3287276-3d8b-4034-a39a-7603321a3784'::UUID
    AND status = 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident transaction is unavailable; refusing automatic repair';
  END IF;

  UPDATE public.inventory
  SET
    available = available - 1,
    reserved = reserved + 1,
    updated_at = NOW()
  WHERE id = target_inventory.id;
END
$$;
