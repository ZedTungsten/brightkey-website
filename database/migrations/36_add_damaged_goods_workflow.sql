ALTER TABLE public.damaged_goods
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS inventory_transaction_id UUID REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unpacked',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS damaged_goods_reference_id_idx
  ON public.damaged_goods(reference_id)
  WHERE reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS damaged_goods_inventory_transaction_idx
  ON public.damaged_goods(inventory_transaction_id)
  WHERE inventory_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS damaged_goods_company_status_idx
  ON public.damaged_goods(company_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_damaged_goods_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = NEW.supplier_id
      AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'The selected supplier does not belong to this company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_damaged_goods_supplier_trigger ON public.damaged_goods;
CREATE TRIGGER validate_damaged_goods_supplier_trigger
  BEFORE INSERT OR UPDATE OF supplier_id, company_id
  ON public.damaged_goods
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_damaged_goods_supplier();

CREATE OR REPLACE FUNCTION public.sync_damaged_goods_from_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status TEXT;
BEGIN
  next_status := CASE NEW.status
    WHEN 'inspect' THEN 'unpacked'
    WHEN 'packed' THEN 'packed'
    WHEN 'dispatched' THEN 'picked_up'
    WHEN 'received' THEN 'received'
    ELSE NULL
  END;

  IF next_status IS NOT NULL THEN
    UPDATE public.damaged_goods
    SET status = next_status,
        archived_at = CASE WHEN next_status = 'received' THEN COALESCE(archived_at, now()) ELSE NULL END,
        updated_at = now()
    WHERE inventory_transaction_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_damaged_goods_inventory_trigger ON public.inventory_transactions;
CREATE TRIGGER sync_damaged_goods_inventory_trigger
  AFTER UPDATE OF status
  ON public.inventory_transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_damaged_goods_from_inventory();

CREATE OR REPLACE FUNCTION public.sync_damaged_goods_from_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status TEXT;
BEGIN
  next_status := CASE
    WHEN NEW.status = 'delivered' THEN 'received'
    WHEN NEW.status = 'picked_up' THEN 'picked_up'
    ELSE 'booked'
  END;

  UPDATE public.damaged_goods
  SET status = next_status,
      archived_at = CASE WHEN next_status = 'received' THEN COALESCE(archived_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE reference_id = NEW.reference_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_damaged_goods_delivery_trigger ON public.delivery_bookings;
CREATE TRIGGER sync_damaged_goods_delivery_trigger
  AFTER INSERT OR UPDATE OF status
  ON public.delivery_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_damaged_goods_from_delivery();
