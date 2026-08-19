-- Prevent future duplicate active reservation rows even when a caller bypasses
-- the atomic reservation RPC. Existing historical duplicates remain untouched.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_customer_order_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.type <> 'customer_order'
     OR NEW.status NOT IN ('reserved', 'inspect', 'packed', 'dispatched') THEN
    RETURN NEW;
  END IF;

  -- Allow an existing active row to advance through the workflow. This keeps
  -- historical duplicate rows operable while preventing new active duplicates.
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('reserved', 'inspect', 'packed', 'dispatched')
     AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id
     AND OLD.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
     AND OLD.reference_id IS NOT DISTINCT FROM NEW.reference_id
     AND upper(trim(OLD.sku)) IS NOT DISTINCT FROM upper(trim(NEW.sku))
     AND OLD.type IS NOT DISTINCT FROM NEW.type THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    concat_ws(
      ':',
      COALESCE(NEW.company_id::TEXT, ''),
      COALESCE(NEW.warehouse_id::TEXT, ''),
      COALESCE(NEW.reference_id, ''),
      upper(trim(COALESCE(NEW.sku, ''))),
      NEW.type
    ),
    0
  ));

  IF EXISTS (
    SELECT 1
    FROM public.inventory_transactions AS existing
    WHERE existing.id IS DISTINCT FROM NEW.id
      AND existing.company_id IS NOT DISTINCT FROM NEW.company_id
      AND existing.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
      AND existing.reference_id = NEW.reference_id
      AND upper(trim(existing.sku)) = upper(trim(NEW.sku))
      AND existing.type = 'customer_order'
      AND existing.status IN ('reserved', 'inspect', 'packed', 'dispatched')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'An active reservation already exists for this order and SKU.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_active_customer_order_reservation
  ON public.inventory_transactions;

CREATE TRIGGER prevent_duplicate_active_customer_order_reservation
BEFORE INSERT OR UPDATE OF company_id, warehouse_id, reference_id, sku, type, status
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_active_customer_order_reservation();
