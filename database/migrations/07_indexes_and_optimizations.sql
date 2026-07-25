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
