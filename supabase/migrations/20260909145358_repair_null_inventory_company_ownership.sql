-- Repair legacy inventory rows that predate company ownership.
-- Warehouses are tenant-owned, so resolve the owning company through the
-- warehouse tenant rather than assuming warehouses have a company_id column.
-- Only unambiguous tenant-to-company relationships are repaired automatically.
WITH warehouse_owners AS (
  SELECT
    warehouse.id AS warehouse_id,
    (ARRAY_AGG(company.id))[1] AS company_id
  FROM public.warehouses AS warehouse
  JOIN public.companies AS company
    ON company.tenant_id = warehouse.tenant_id
  GROUP BY warehouse.id
  HAVING COUNT(*) = 1
)
UPDATE public.inventory AS inventory
SET
  company_id = warehouse_owner.company_id,
  updated_at = NOW()
FROM warehouse_owners AS warehouse_owner
WHERE inventory.warehouse_id = warehouse_owner.warehouse_id
  AND inventory.company_id IS NULL;
