-- Repair warehouse queue visibility and prevent future orphaned transactions.
-- Ownership is derived through warehouses.tenant_id because the live warehouses
-- table is tenant-owned rather than directly company-owned.

UPDATE public.inventory_transactions AS transaction
SET company_id = company.id
FROM public.warehouses AS warehouse
JOIN public.companies AS company
  ON company.tenant_id = warehouse.tenant_id
WHERE transaction.company_id IS NULL
  AND transaction.warehouse_id = warehouse.id;

UPDATE public.inventory_transactions AS transaction
SET company_id = booking.company_id
FROM public.installation_bookings AS booking
WHERE transaction.company_id IS NULL
  AND booking.company_id IS NOT NULL
  AND booking.order_no = transaction.reference_id;

UPDATE public.inventory_transactions AS transaction
SET warehouse_id = chosen_warehouse.id
FROM public.companies AS company
JOIN LATERAL (
  SELECT warehouse.id
  FROM public.warehouses AS warehouse
  WHERE warehouse.tenant_id = company.tenant_id
    AND warehouse.is_active = TRUE
  ORDER BY warehouse.created_at ASC, warehouse.id ASC
  LIMIT 1
) AS chosen_warehouse ON TRUE
WHERE transaction.warehouse_id IS NULL
  AND transaction.company_id = company.id
  AND EXISTS (
    SELECT 1
    FROM public.installation_bookings AS booking
    WHERE booking.company_id = transaction.company_id
      AND booking.order_no = transaction.reference_id
  );

CREATE OR REPLACE FUNCTION public.enforce_inventory_transaction_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  warehouse_company_id UUID;
BEGIN
  IF NEW.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'A warehouse is required for every inventory transaction.';
  END IF;

  SELECT company.id
  INTO warehouse_company_id
  FROM public.warehouses AS warehouse
  JOIN public.companies AS company
    ON company.tenant_id = warehouse.tenant_id
  WHERE warehouse.id = NEW.warehouse_id
  LIMIT 1;

  IF warehouse_company_id IS NULL THEN
    RAISE EXCEPTION 'The selected warehouse is not linked to a company.';
  END IF;

  IF NEW.company_id IS NULL THEN
    NEW.company_id := warehouse_company_id;
  ELSIF NEW.company_id <> warehouse_company_id THEN
    RAISE EXCEPTION 'The selected warehouse does not belong to this company.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_inventory_transaction_ownership
  ON public.inventory_transactions;

CREATE TRIGGER trg_enforce_inventory_transaction_ownership
BEFORE INSERT OR UPDATE OF company_id, warehouse_id
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inventory_transaction_ownership();
