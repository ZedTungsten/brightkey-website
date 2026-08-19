-- Four failed invoice-save attempts reserved the same one-unit A12 TT item
-- before the booking update failed. The later cancellation restored reserved
-- but not available, leaving this exact warehouse row understated by four.
-- Snapshot guards make the correction rerunnable and prevent it from touching
-- a row whose inventory state has changed since the incident audit.

UPDATE public.inventory AS inventory
SET
  available = inventory.available + 4,
  updated_at = NOW()
WHERE inventory.id = 'b36b5136-2c79-4021-9774-f9b4af892277'::UUID
  AND inventory.warehouse_id = '23e0710e-edfe-455f-a0ef-74df6749687b'::UUID
  AND upper(trim(inventory.sku)) = 'A12 TT'
  AND inventory.available = 3
  AND inventory.reserved = 0
  AND inventory.cancelled = 4
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_transactions AS transaction
    WHERE transaction.reference_id = 'ORD-20260815-040'
      AND transaction.warehouse_id = inventory.warehouse_id
      AND upper(trim(transaction.sku)) = 'A12 TT'
      AND transaction.type = 'customer_order'
      AND transaction.status IN ('reserved', 'inspect', 'packed', 'dispatched')
  );
