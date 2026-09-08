CREATE OR REPLACE FUNCTION public.reserve_customer_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.inventory
  SET available = available - NEW.quantity,
      reserved = reserved + NEW.quantity,
      updated_at = now()
  WHERE company_id = NEW.company_id
    AND warehouse_id = NEW.warehouse_id
    AND upper(sku) = upper(NEW.sku);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No inventory row exists for reserved SKU % in warehouse %',
      NEW.sku, NEW.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_customer_order_inventory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_customer_order_inventory() FROM anon;
REVOKE ALL ON FUNCTION public.reserve_customer_order_inventory() FROM authenticated;

DROP TRIGGER IF EXISTS inventory_reserve_customer_order ON public.inventory_transactions;
CREATE TRIGGER inventory_reserve_customer_order
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
WHEN (
  NEW.type = 'customer_order'
  AND NEW.status = 'reserved'
  AND NEW.quantity > 0
)
EXECUTE FUNCTION public.reserve_customer_order_inventory();
