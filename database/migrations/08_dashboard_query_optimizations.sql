-- =============================================================================
-- Dashboard query optimizations
-- Replaces global client-side logistics scans with one compact, tenant-safe RPC.
-- All statements are non-destructive and safe to rerun.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_companies_tenant_id
  ON public.companies (tenant_id);

CREATE INDEX IF NOT EXISTS idx_delivery_bookings_company_reference
  ON public.delivery_bookings (company_id, reference_id);

CREATE OR REPLACE FUNCTION public.get_logistics_badges(p_company_id UUID)
RETURNS TABLE (
  warehouse_pending BOOLEAN,
  shipments_pending BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH authorized_company AS (
    SELECT c.id
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = p_company_id
      AND tm.user_id = (SELECT auth.uid())
    LIMIT 1
  ),
  company_transactions AS MATERIALIZED (
    SELECT tx.type, tx.status, tx.reference_id
    FROM public.inventory_transactions tx
    JOIN authorized_company ac ON ac.id = tx.company_id
    WHERE tx.status IN (
      'reserved', 'inspect', 'packed', 'ordered',
      'dispatched', 'returned', 'cancelled'
    )
  ),
  booked_references AS MATERIALIZED (
    SELECT db.reference_id
    FROM public.delivery_bookings db
    JOIN authorized_company ac ON ac.id = db.company_id
    WHERE db.reference_id IS NOT NULL
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM company_transactions tx
      WHERE
        (tx.type = 'customer_order' AND tx.status IN ('reserved', 'inspect'))
        OR (
          tx.status = 'packed'
          AND (
            tx.reference_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM company_transactions sibling
              WHERE sibling.reference_id = tx.reference_id
                AND sibling.status IN ('reserved', 'inspect')
            )
          )
        )
        OR (
          tx.reference_id IS NOT NULL
          AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
          AND tx.status IN ('ordered', 'dispatched')
          AND EXISTS (
            SELECT 1 FROM booked_references booked
            WHERE booked.reference_id = tx.reference_id
          )
        )
        OR (
          tx.type IS DISTINCT FROM 'supplier_order'
          AND tx.status IN ('ordered', 'returned', 'cancelled')
          AND (
            tx.reference_id IS NULL
            OR (
              tx.reference_id NOT LIKE 'RCV-%'
              AND tx.reference_id NOT LIKE 'SUP-%'
            )
          )
        )
    ) AS warehouse_pending,
    EXISTS (
      SELECT 1
      FROM company_transactions tx
      WHERE
        (
          tx.type = 'customer_order'
          AND tx.status = 'packed'
          AND (tx.reference_id IS NULL OR tx.reference_id NOT LIKE 'RCV-%')
          AND NOT EXISTS (
            SELECT 1 FROM booked_references booked
            WHERE booked.reference_id = tx.reference_id
          )
          AND (
            tx.reference_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM company_transactions sibling
              WHERE sibling.reference_id = tx.reference_id
                AND sibling.status IN ('reserved', 'inspect')
            )
          )
        )
        OR (
          tx.status = 'ordered'
          AND tx.reference_id IS NOT NULL
          AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
          AND NOT EXISTS (
            SELECT 1 FROM booked_references booked
            WHERE booked.reference_id = tx.reference_id
          )
        )
    ) AS shipments_pending;
$$;

REVOKE ALL ON FUNCTION public.get_logistics_badges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_logistics_badges(UUID) TO authenticated;
