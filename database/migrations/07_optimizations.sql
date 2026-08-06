-- Consolidated Database Migration: 07_optimizations.sql
-- Generated on 2026-08-06T15:24:48.295Z


-- =========================================================================
-- SOURCE FILE: 07_indexes_and_optimizations.sql
-- =========================================================================

-- =============================================================================
-- BrightKey Consolidated Performance Indexes & Optimizations (07_indexes_and_optimizations.sql)
-- Composite indexes for high-frequency dashboard query shapes.
-- All statements are non-destructive and safe to rerun.
-- =============================================================================

-- ── 1. Attendance Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_created_at
  ON public.attendance_logs (employee_id, created_at DESC);

-- ── 2. Operations & Installation Bookings Indexes ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_installation_bookings_company_status
  ON public.installation_bookings (company_id, status);

CREATE INDEX IF NOT EXISTS idx_installation_bookings_company_scheduled_date
  ON public.installation_bookings (company_id, scheduled_date);

-- ── 3. Warehousing & Inventory Transaction Indexes ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_warehouse_created
  ON public.inventory_transactions (company_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_reference_type_status
  ON public.inventory_transactions (company_id, reference_id, type, status);

CREATE INDEX IF NOT EXISTS idx_inventory_company_warehouse_sku
  ON public.inventory (company_id, warehouse_id, sku);

-- ── 4. Products & Catalog Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_company_sku
  ON public.products (company_id, sku);

CREATE INDEX IF NOT EXISTS idx_products_company_created_at
  ON public.products (company_id, created_at DESC);

-- ── 5. Reviews Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_reviews_company_created_at
  ON public.product_reviews (company_id, created_at DESC);


-- =========================================================================
-- SOURCE FILE: 08_dashboard_query_optimizations.sql
-- =========================================================================

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


-- =========================================================================
-- SOURCE FILE: 09_optimize_hot_rls_policies.sql
-- =========================================================================

-- =============================================================================
-- Optimize authentication function evaluation in verified hot RLS policies.
-- Wrapping auth helpers in scalar subqueries lets PostgreSQL evaluate them once
-- per statement instead of once per candidate row.
-- =============================================================================

ALTER POLICY "Allow tenant members write access to companies"
  ON public.companies
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Allow users to view authorized companies"
  ON public.companies
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Company delivery bookings access"
  ON public.delivery_bookings
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      WHERE c.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    )
  );

ALTER POLICY "Allow company members to view attendance logs"
  ON public.attendance_logs
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Employees can insert their own attendance logs"
  ON public.attendance_logs
  WITH CHECK ((SELECT auth.uid()) = employee_id);

ALTER POLICY "HR module attendance_logs"
  ON public.attendance_logs
  USING (
    public.has_module_access((SELECT auth.uid()), company_id, 'HR')
  )
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'HR')
  );

ALTER POLICY "Operations module installation_bookings"
  ON public.installation_bookings
  USING (
    public.has_module_access((SELECT auth.uid()), company_id, 'Operations')
  )
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'Operations')
  );

ALTER POLICY "Participants can read chat thread state"
  ON public.chat_thread_members
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.chat_threads thread
        ON thread.id = chat_thread_members.thread_id
      WHERE employee.id = chat_thread_members.employee_id
        AND employee.company_id = thread.company_id
        AND lower(employee.email) =
          lower((SELECT auth.jwt()) ->> 'email')
    )
  );

ALTER POLICY "Allow members insert chats"
  ON public.employee_chats
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      WHERE c.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.company_id = employee_chats.company_id
        AND employee.id = employee_chats.sender_id
        AND lower(employee.email) =
          lower((SELECT auth.jwt()) ->> 'email')
    )
  );

ALTER POLICY "Allow members read company chats"
  ON public.employee_chats
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      WHERE c.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.company_id = employee_chats.company_id
        AND employee.id = ANY (
          ARRAY[employee_chats.sender_id, employee_chats.receiver_id]
        )
        AND lower(employee.email) =
          lower((SELECT auth.jwt()) ->> 'email')
    )
  );
