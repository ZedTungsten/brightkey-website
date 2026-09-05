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


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_storage_quota_enforcement_and_notice.sql
-- =========================================================================

-- Maintain a bounded company storage summary, enforce plan quotas for every
-- company-scoped Storage upload, and expose a lightweight dashboard notice.

ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS storage_limit_gb NUMERIC(10, 2);

CREATE TABLE IF NOT EXISTS public.company_storage_usage (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  assets_bytes BIGINT NOT NULL DEFAULT 0 CHECK (assets_bytes >= 0),
  internal_bytes BIGINT NOT NULL DEFAULT 0 CHECK (internal_bytes >= 0),
  file_count BIGINT NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_storage_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.storage_company_id(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_match TEXT[];
BEGIN
  v_match := regexp_match(COALESCE(p_name, ''), '^companies/([0-9a-fA-F-]{36})/');
  IF v_match IS NULL THEN RETURN NULL; END IF;
  RETURN v_match[1]::UUID;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_object_bytes(p_metadata JSONB)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_metadata ->> 'size', '') ~ '^[0-9]+$'
    THEN (p_metadata ->> 'size')::BIGINT
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_company_storage_usage(
  p_company_id UUID,
  p_assets_delta BIGINT,
  p_internal_delta BIGINT,
  p_file_delta BIGINT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.company_storage_usage (
    company_id, assets_bytes, internal_bytes, file_count, updated_at
  ) VALUES (
    p_company_id,
    GREATEST(COALESCE(p_assets_delta, 0), 0),
    GREATEST(COALESCE(p_internal_delta, 0), 0),
    GREATEST(COALESCE(p_file_delta, 0), 0),
    NOW()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    assets_bytes = GREATEST(public.company_storage_usage.assets_bytes + COALESCE(p_assets_delta, 0), 0),
    internal_bytes = GREATEST(public.company_storage_usage.internal_bytes + COALESCE(p_internal_delta, 0), 0),
    file_count = GREATEST(public.company_storage_usage.file_count + COALESCE(p_file_delta, 0), 0),
    updated_at = NOW();
$$;

CREATE OR REPLACE FUNCTION public.track_company_storage_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_old_company UUID;
  v_new_company UUID;
  v_old_bytes BIGINT := 0;
  v_new_bytes BIGINT := 0;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE')
     AND OLD.bucket_id IN ('brightkey-assets', 'brightkey-internal') THEN
    v_old_company := public.storage_company_id(OLD.name);
    v_old_bytes := public.storage_object_bytes(OLD.metadata);
    IF v_old_company IS NOT NULL THEN
      PERFORM public.adjust_company_storage_usage(
        v_old_company,
        CASE WHEN OLD.bucket_id = 'brightkey-assets' THEN -v_old_bytes ELSE 0 END,
        CASE WHEN OLD.bucket_id = 'brightkey-internal' THEN -v_old_bytes ELSE 0 END,
        -1
      );
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.bucket_id IN ('brightkey-assets', 'brightkey-internal') THEN
    v_new_company := public.storage_company_id(NEW.name);
    v_new_bytes := public.storage_object_bytes(NEW.metadata);
    IF v_new_company IS NOT NULL THEN
      PERFORM public.adjust_company_storage_usage(
        v_new_company,
        CASE WHEN NEW.bucket_id = 'brightkey-assets' THEN v_new_bytes ELSE 0 END,
        CASE WHEN NEW.bucket_id = 'brightkey-internal' THEN v_new_bytes ELSE 0 END,
        1
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_company_storage_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_company_id UUID;
  v_tenant_id UUID;
  v_limit_bytes BIGINT;
  v_used_bytes BIGINT;
  v_incoming_bytes BIGINT;
  v_replaced_bytes BIGINT := 0;
BEGIN
  IF NEW.bucket_id NOT IN ('brightkey-assets', 'brightkey-internal') THEN
    RETURN NEW;
  END IF;

  v_company_id := public.storage_company_id(NEW.name);
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  SELECT t.id,
         COALESCE(
           GREATEST(512, ROUND(pt.storage_limit_gb * 1024))::BIGINT,
           t.storage_limit_mb::BIGINT,
           5120::BIGINT
         ) * 1024 * 1024
  INTO v_tenant_id, v_limit_bytes
  FROM public.companies c
  JOIN public.tenants t ON t.id = c.tenant_id
  LEFT JOIN public.pricing_tiers pt ON pt.id = t.pricing_tier_id
  WHERE c.id = v_company_id;

  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;

  -- Serialize uploads for this tenant so concurrent requests cannot overrun it.
  PERFORM 1 FROM public.tenants WHERE id = v_tenant_id FOR UPDATE;

  SELECT COALESCE(assets_bytes, 0) + COALESCE(internal_bytes, 0)
  INTO v_used_bytes
  FROM public.company_storage_usage
  WHERE company_id = v_company_id;
  v_used_bytes := COALESCE(v_used_bytes, 0);
  v_incoming_bytes := public.storage_object_bytes(NEW.metadata);

  IF TG_OP = 'UPDATE'
     AND OLD.bucket_id IN ('brightkey-assets', 'brightkey-internal')
     AND public.storage_company_id(OLD.name) = v_company_id THEN
    v_replaced_bytes := public.storage_object_bytes(OLD.metadata);
  END IF;

  IF v_used_bytes - v_replaced_bytes + v_incoming_bytes > v_limit_bytes THEN
    RAISE EXCEPTION 'Account storage is full. Users cannot upload more files.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_company_storage_quota_trigger'
      AND tgrelid = 'storage.objects'::regclass
  ) THEN
    CREATE TRIGGER enforce_company_storage_quota_trigger
      BEFORE INSERT OR UPDATE OF bucket_id, name, metadata
      ON storage.objects
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_company_storage_quota();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'track_company_storage_usage_trigger'
      AND tgrelid = 'storage.objects'::regclass
  ) THEN
    CREATE TRIGGER track_company_storage_usage_trigger
      AFTER INSERT OR DELETE OR UPDATE OF bucket_id, name, metadata
      ON storage.objects
      FOR EACH ROW
      EXECUTE FUNCTION public.track_company_storage_usage();
  END IF;
END $$;

INSERT INTO public.company_storage_usage (
  company_id, assets_bytes, internal_bytes, file_count, updated_at
)
SELECT
  c.id,
  COALESCE(SUM(public.storage_object_bytes(o.metadata)) FILTER (WHERE o.bucket_id = 'brightkey-assets'), 0),
  COALESCE(SUM(public.storage_object_bytes(o.metadata)) FILTER (WHERE o.bucket_id = 'brightkey-internal'), 0),
  COUNT(o.id),
  NOW()
FROM public.companies c
LEFT JOIN storage.objects o
  ON o.bucket_id IN ('brightkey-assets', 'brightkey-internal')
 AND public.storage_company_id(o.name) = c.id
GROUP BY c.id
ON CONFLICT (company_id) DO UPDATE SET
  assets_bytes = EXCLUDED.assets_bytes,
  internal_bytes = EXCLUDED.internal_bytes,
  file_count = EXCLUDED.file_count,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.get_company_storage_usage(p_company_id UUID)
RETURNS TABLE (
  used_bytes BIGINT,
  file_count BIGINT,
  assets_bytes BIGINT,
  internal_bytes BIGINT,
  limit_bytes BIGINT,
  remaining_bytes BIGINT,
  usage_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_bytes BIGINT;
  v_used_bytes BIGINT;
  v_file_count BIGINT;
  v_assets_bytes BIGINT;
  v_internal_bytes BIGINT;
BEGIN
  IF auth.role() <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'email', '') <> 'johnzeustaller@gmail.com'
     AND NOT EXISTS (
       SELECT 1
       FROM public.companies c
       JOIN public.tenants t ON t.id = c.tenant_id
       WHERE c.id = p_company_id
         AND (
           lower(COALESCE(t.owner_email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
           OR EXISTS (
             SELECT 1
             FROM public.tenant_members tm
             WHERE tm.tenant_id = c.tenant_id
               AND tm.user_id = auth.uid()
           )
         )
     ) THEN
    RAISE EXCEPTION 'You do not have access to this company storage.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
           GREATEST(512, ROUND(pt.storage_limit_gb * 1024))::BIGINT,
           t.storage_limit_mb::BIGINT,
           5120::BIGINT
         ) * 1024 * 1024,
         COALESCE(s.assets_bytes, 0),
         COALESCE(s.internal_bytes, 0),
         COALESCE(s.file_count, 0)
  INTO v_limit_bytes, v_assets_bytes, v_internal_bytes, v_file_count
  FROM public.companies c
  JOIN public.tenants t ON t.id = c.tenant_id
  LEFT JOIN public.pricing_tiers pt ON pt.id = t.pricing_tier_id
  LEFT JOIN public.company_storage_usage s ON s.company_id = c.id
  WHERE c.id = p_company_id;

  IF v_limit_bytes IS NULL THEN
    RAISE EXCEPTION 'Company storage configuration was not found.'
      USING ERRCODE = 'P0002';
  END IF;

  v_used_bytes := v_assets_bytes + v_internal_bytes;

  RETURN QUERY SELECT
    v_used_bytes,
    v_file_count,
    v_assets_bytes,
    v_internal_bytes,
    v_limit_bytes,
    GREATEST(v_limit_bytes - v_used_bytes, 0),
    CASE WHEN v_limit_bytes > 0
      THEN ROUND((v_used_bytes::NUMERIC / v_limit_bytes::NUMERIC) * 100, 2)
      ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_company_storage_quota(
  p_company_id UUID,
  p_incoming_bytes BIGINT DEFAULT 0
)
RETURNS TABLE (
  allowed BOOLEAN,
  used_bytes BIGINT,
  incoming_bytes BIGINT,
  projected_bytes BIGINT,
  limit_bytes BIGINT,
  remaining_bytes BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    (usage.used_bytes + GREATEST(p_incoming_bytes, 0)) <= usage.limit_bytes,
    usage.used_bytes,
    GREATEST(p_incoming_bytes, 0),
    usage.used_bytes + GREATEST(p_incoming_bytes, 0),
    usage.limit_bytes,
    GREATEST(usage.limit_bytes - (usage.used_bytes + GREATEST(p_incoming_bytes, 0)), 0)
  FROM public.get_company_storage_usage(p_company_id) AS usage;
$$;

REVOKE ALL ON FUNCTION public.check_company_storage_quota(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_company_storage_quota(UUID, BIGINT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_storage_notice(p_company_id UUID)
RETURNS TABLE (
  status TEXT,
  used_bytes BIGINT,
  limit_bytes BIGINT,
  remaining_bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN usage.remaining_bytes <= 0 THEN 'full'
      WHEN usage.remaining_bytes <= 536870912 THEN 'almost_full'
      ELSE 'ok'
    END,
    usage.used_bytes,
    usage.limit_bytes,
    usage.remaining_bytes
  FROM public.get_company_storage_usage(p_company_id) AS usage;
$$;

REVOKE ALL ON FUNCTION public.get_company_storage_notice(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_storage_notice(UUID) TO authenticated, service_role;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260809_security_and_query_hardening.sql
-- =========================================================================

-- Compatibility-preserving security and General Journal query hardening.
-- Authenticated tenant members retain the same company-wide access.

ALTER TABLE public.company_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_journal ENABLE ROW LEVEL SECURITY;

-- Remove legacy unrestricted policies discovered in the live project.
DROP POLICY IF EXISTS "public_all" ON public.general_journal;
DROP POLICY IF EXISTS "Allow all write for settings" ON public.global_settings;

DROP POLICY IF EXISTS "Allow public read for settings" ON public.global_settings;
CREATE POLICY "Allow public storefront settings read"
  ON public.global_settings
  FOR SELECT
  TO anon
  USING (key IN (
    'free_shipping',
    'free_gifts',
    'upsell_cross_sell',
    'delivery_lead_time',
    'promo_popup',
    'invoice_template'
  ));

DROP POLICY IF EXISTS "Allow tenant members integrations access" ON public.company_integrations;
CREATE POLICY "Allow tenant members integrations access"
  ON public.company_integrations
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE VIEW public.view_public_integrations
WITH (security_invoker = false)
AS
SELECT
  company_id,
  (paymongo_public_key IS NOT NULL AND paymongo_secret_key IS NOT NULL) AS paymongo_configured,
  (stripe_public_key IS NOT NULL AND stripe_secret_key IS NOT NULL) AS stripe_configured,
  paymongo_public_key,
  stripe_public_key
FROM public.company_integrations;

GRANT SELECT ON public.view_public_integrations TO anon, authenticated;

DROP POLICY IF EXISTS "Allow tenant members journal access" ON public.general_journal;
CREATE POLICY "Allow tenant members journal access"
  ON public.general_journal
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_general_journal_summary(
  p_company_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL,
  p_accounts TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_search_entry_number INTEGER DEFAULT NULL,
  p_search_number NUMERIC DEFAULT NULL,
  p_search_is_integer BOOLEAN DEFAULT FALSE,
  p_snapshot_entry_numbers INTEGER[] DEFAULT NULL,
  p_snapshot_months TEXT[] DEFAULT NULL
)
RETURNS TABLE(sum_debit NUMERIC, sum_credit NUMERIC, row_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(gj.debit), 0),
    COALESCE(SUM(gj.credit), 0),
    COUNT(*)
  FROM public.general_journal gj
  WHERE gj.company_id = p_company_id
    AND (p_date_from IS NULL OR gj.date >= p_date_from)
    AND (p_date_to IS NULL OR gj.date <= p_date_to)
    AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL OR p_year IS NULL OR gj.year = p_year)
    AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL OR p_month IS NULL OR gj.month = p_month)
    AND (p_accounts IS NULL OR cardinality(p_accounts) = 0 OR gj.account = ANY(p_accounts))
    AND (
      (COALESCE(cardinality(p_snapshot_entry_numbers), 0) = 0 AND gj.entry_number > 0)
      OR
      (COALESCE(cardinality(p_snapshot_entry_numbers), 0) > 0 AND (
        gj.entry_number = ANY(p_snapshot_entry_numbers)
        OR (
          gj.entry_number > 0
          AND NOT (to_char(gj.date, 'YYYY-MM') = ANY(p_snapshot_months))
        )
      ))
    )
    AND (
      NULLIF(BTRIM(p_search), '') IS NULL
      OR gj.account ILIKE '%' || p_search || '%'
      OR COALESCE(gj.description_1, '') ILIKE '%' || p_search || '%'
      OR COALESCE(gj.description_2, '') ILIKE '%' || p_search || '%'
      OR (p_search_entry_number IS NOT NULL AND gj.entry_number = p_search_entry_number)
      OR (p_search_number IS NOT NULL AND (gj.debit = p_search_number OR gj.credit = p_search_number))
      OR (p_search_number IS NOT NULL AND p_search_is_integer AND (
        (gj.debit >= p_search_number AND gj.debit < p_search_number + 1)
        OR (gj.credit >= p_search_number AND gj.credit < p_search_number + 1)
      ))
    );
$$;

REVOKE ALL ON FUNCTION public.get_general_journal_summary(UUID, DATE, DATE, INTEGER, INTEGER, TEXT[], TEXT, INTEGER, NUMERIC, BOOLEAN, INTEGER[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_general_journal_summary(UUID, DATE, DATE, INTEGER, INTEGER, TEXT[], TEXT, INTEGER, NUMERIC, BOOLEAN, INTEGER[], TEXT[]) TO authenticated;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260817_align_warehouse_badge_counts.sql
-- =========================================================================

-- Keep warehouse tab badges equivalent to their visible queues.
-- This replaces the older production RPC that counted cancelled Receive rows
-- and products that do not participate in inventory workflows.

CREATE OR REPLACE FUNCTION public.get_warehouse_tab_counts(
  p_company_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  receive_count BIGINT,
  inspect_count BIGINT,
  pack_count BIGINT,
  dispatch_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_receive_count BIGINT := 0;
  v_inspect_count BIGINT := 0;
  v_pack_count BIGINT := 0;
  v_dispatch_count BIGINT := 0;
BEGIN
  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_inspect_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'reserved'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id
        AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_pack_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'inspect'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id
        AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT tx.reference_id)
  INTO v_dispatch_count
  FROM public.inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.status = 'packed'
    AND tx.type = 'customer_order'
    AND tx.reference_id IS NOT NULL
    AND UPPER(TRIM(tx.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
    AND tx.sku NOT LIKE 'OC-%'
    AND tx.sku NOT LIKE 'BJ-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.company_id = tx.company_id
        AND product.sku = tx.sku
        AND product.count_inventory = false
    )
    AND (p_warehouse_id IS NULL OR tx.warehouse_id = p_warehouse_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_transactions other
      WHERE other.company_id = p_company_id
        AND other.reference_id = tx.reference_id
        AND other.status IN ('reserved', 'inspect')
        AND UPPER(TRIM(other.sku)) NOT IN ('OCULAR', 'BACKJOB', 'DAY OFF', 'DAYOFF', 'SERVICE', 'INSTALLATION')
        AND other.sku NOT LIKE 'OC-%'
        AND other.sku NOT LIKE 'BJ-%'
        AND NOT EXISTS (
          SELECT 1 FROM public.products product
          WHERE product.company_id = other.company_id
            AND product.sku = other.sku
            AND product.count_inventory = false
        )
    );

  SELECT
    (
      SELECT COUNT(*)
      FROM public.inventory_transactions tx
      WHERE tx.company_id = p_company_id
        AND (
          (p_warehouse_id IS NOT NULL AND tx.warehouse_id = p_warehouse_id)
          OR (p_warehouse_id IS NULL AND tx.warehouse_id IS NULL)
        )
        AND (
          tx.type <> 'customer_order'
          OR (
            tx.reference_id IS NOT NULL
            AND (
              tx.reference_id LIKE 'ORD-%'
              OR tx.reference_id LIKE 'OC-%'
              OR tx.reference_id LIKE 'RCV-%'
              OR tx.reference_id LIKE 'SND-%'
            )
          )
        )
        AND (
          (
            tx.reference_id IS NOT NULL
            AND (tx.reference_id LIKE 'RCV-%' OR tx.reference_id LIKE 'SUP-%')
            AND tx.status IN ('ordered', 'dispatched')
            AND EXISTS (
              SELECT 1
              FROM public.delivery_bookings delivery
              WHERE delivery.company_id = p_company_id
                AND delivery.reference_id = tx.reference_id
            )
          )
          OR (
            (
              tx.reference_id IS NULL
              OR (tx.reference_id NOT LIKE 'RCV-%' AND tx.reference_id NOT LIKE 'SUP-%')
            )
            AND tx.status IN ('ordered', 'returned')
            AND tx.type <> 'supplier_order'
          )
        )
    )
    + (
      SELECT COUNT(*)
      FROM public.warehouse_transfers transfer
      WHERE transfer.company_id = p_company_id
        AND transfer.status = 'approved'
        AND transfer.to_warehouse_id = p_warehouse_id
    )
  INTO v_receive_count;

  RETURN QUERY SELECT
    COALESCE(v_receive_count, 0),
    COALESCE(v_inspect_count, 0),
    COALESCE(v_pack_count, 0),
    COALESCE(v_dispatch_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warehouse_tab_counts(UUID, UUID)
  TO authenticated, service_role;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819_chat_broadcast_scalability.sql
-- =========================================================================

-- Scale dashboard chat without changing participant or tenant visibility.
-- Persistent messages remain in public.employee_chats; Realtime broadcasts are
-- only an invalidation/delivery transport and are never the source of truth.

CREATE OR REPLACE FUNCTION public.get_employee_chat_unread_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(member.unread_count), 0)::BIGINT
  FROM public.chat_thread_members AS member
  JOIN public.chat_threads AS thread
    ON thread.id = member.thread_id
  JOIN public.employees AS employee
    ON employee.id = member.employee_id
   AND employee.company_id = thread.company_id
  WHERE lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND thread.company_id IN (
      SELECT company.id
      FROM public.companies AS company
      WHERE company.tenant_id IN (
        SELECT public.get_user_tenants((SELECT auth.uid()))
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_employee_chat_unread_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_chat_unread_total() TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_employee_chat_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    to_jsonb(NEW),
    'chat_message',
    'employee:' || NEW.sender_id::TEXT || ':chat',
    TRUE
  );

  PERFORM realtime.send(
    to_jsonb(NEW),
    'chat_message',
    'employee:' || NEW.receiver_id::TEXT || ':chat',
    TRUE
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_employee_chat_insert() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'broadcast_employee_chat_insert_trigger'
      AND tgrelid = 'public.employee_chats'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER broadcast_employee_chat_insert_trigger
      AFTER INSERT ON public.employee_chats
      FOR EACH ROW
      EXECUTE FUNCTION public.broadcast_employee_chat_insert();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.broadcast_employee_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_company_id UUID;
BEGIN
  SELECT employee.company_id
  INTO target_company_id
  FROM public.employees AS employee
  WHERE employee.id = NEW.employee_id;

  IF target_company_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'employee_id', NEW.employee_id,
        'status', NEW.status,
        'created_at', NEW.created_at
      ),
      'presence_changed',
      'company:' || target_company_id::TEXT || ':chat',
      TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_employee_presence_change() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'broadcast_employee_presence_change_trigger'
      AND tgrelid = 'public.attendance_logs'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER broadcast_employee_presence_change_trigger
      AFTER INSERT ON public.attendance_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.broadcast_employee_presence_change();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'Chat participants can receive private broadcasts'
  ) THEN
    CREATE POLICY "Chat participants can receive private broadcasts"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        (
          realtime.topic() LIKE 'employee:%:chat'
          AND EXISTS (
            SELECT 1
            FROM public.employees AS employee
            JOIN public.companies AS company
              ON company.id = employee.company_id
            WHERE realtime.topic() = 'employee:' || employee.id::TEXT || ':chat'
              AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
              AND company.tenant_id IN (
                SELECT public.get_user_tenants((SELECT auth.uid()))
              )
          )
        )
        OR
        (
          realtime.topic() LIKE 'company:%:chat'
          AND EXISTS (
            SELECT 1
            FROM public.companies AS company
            WHERE realtime.topic() = 'company:' || company.id::TEXT || ':chat'
              AND company.tenant_id IN (
                SELECT public.get_user_tenants((SELECT auth.uid()))
              )
          )
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819_chat_image_attachments.sql
-- =========================================================================

-- Private, tenant-scoped JPEG attachments for direct, group, and company chat.

ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_mime TEXT;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_bytes BIGINT;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_width INTEGER;
ALTER TABLE public.employee_chats ADD COLUMN IF NOT EXISTS attachment_height INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_chats_attachment_check') THEN
    ALTER TABLE public.employee_chats ADD CONSTRAINT employee_chats_attachment_check CHECK (
      (attachment_path IS NULL AND attachment_mime IS NULL AND attachment_bytes IS NULL
        AND attachment_width IS NULL AND attachment_height IS NULL)
      OR (attachment_path IS NOT NULL AND attachment_mime = 'image/jpeg'
        AND attachment_bytes BETWEEN 1 AND 5242880
        AND attachment_width BETWEEN 1 AND 4096 AND attachment_height BETWEEN 1 AND 4096)
    );
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 5242880, ARRAY['image/jpeg']::TEXT[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg']::TEXT[];

CREATE OR REPLACE FUNCTION public.can_access_chat_media(p_company_id UUID, p_thread_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chat_threads AS thread
    WHERE thread.id = p_thread_id AND thread.company_id = p_company_id
      AND public.is_chat_thread_member(thread.id)
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_chat_media(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chat_media(UUID, UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Chat members can read chat media') THEN
    CREATE POLICY "Chat members can read chat media" ON storage.objects FOR SELECT TO authenticated USING (
      bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
      AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Chat members can upload chat media') THEN
    CREATE POLICY "Chat members can upload chat media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
      bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
      AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Chat uploaders can delete own media') THEN
    CREATE POLICY "Chat uploaders can delete own media" ON storage.objects FOR DELETE TO authenticated USING (
      bucket_id = 'chat-media' AND owner_id = (SELECT auth.uid())::TEXT
      AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
    );
  END IF;
END
$$;

ALTER POLICY "Chat members can read chat media" ON storage.objects USING (
  bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
);
ALTER POLICY "Chat members can upload chat media" ON storage.objects WITH CHECK (
  bucket_id = 'chat-media' AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/chat/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  AND public.can_access_chat_media(((storage.foldername(name))[2])::UUID, ((storage.foldername(name))[4])::UUID)
);

CREATE OR REPLACE FUNCTION public.get_chat_thread_messages_v2(
  p_thread_id UUID, p_before_created_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID, thread_id UUID, sender_id UUID, sender_name TEXT, sender_picture TEXT,
  message TEXT, created_at TIMESTAMPTZ, attachment_path TEXT, attachment_mime TEXT,
  attachment_bytes BIGINT, attachment_width INTEGER, attachment_height INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_chat_thread_member(p_thread_id) THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  RETURN QUERY SELECT chat.id, chat.thread_id, chat.sender_id,
    concat_ws(' ', sender.first_name, sender.last_name), sender.picture_link::TEXT,
    chat.message, chat.created_at, chat.attachment_path, chat.attachment_mime,
    chat.attachment_bytes, chat.attachment_width, chat.attachment_height
  FROM public.employee_chats AS chat
  JOIN public.employees AS sender ON sender.id = chat.sender_id
  WHERE chat.thread_id = p_thread_id
    AND (p_before_created_at IS NULL OR chat.created_at < p_before_created_at
      OR (chat.created_at = p_before_created_at AND chat.id < p_before_id))
  ORDER BY chat.created_at DESC, chat.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_thread_messages_v2(UUID, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages_v2(UUID, TIMESTAMPTZ, UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_chat_thread_message_v2(
  p_thread_id UUID, p_message TEXT DEFAULT '', p_attachment_path TEXT DEFAULT NULL,
  p_attachment_mime TEXT DEFAULT NULL, p_attachment_bytes BIGINT DEFAULT NULL,
  p_attachment_width INTEGER DEFAULT NULL, p_attachment_height INTEGER DEFAULT NULL
)
RETURNS public.employee_chats LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sender public.employees%ROWTYPE; target_thread public.chat_threads%ROWTYPE;
  receiver UUID; sent public.employee_chats%ROWTYPE; clean_message TEXT := btrim(COALESCE(p_message, ''));
BEGIN
  SELECT employee.* INTO sender FROM public.employees AS employee
  JOIN public.chat_thread_members AS member ON member.employee_id = employee.id AND member.thread_id = p_thread_id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.removed_at IS NULL AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid()))) LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  IF length(clean_message) > 5000 OR (clean_message = '' AND p_attachment_path IS NULL) THEN
    RAISE EXCEPTION 'A message or image is required';
  END IF;
  IF p_attachment_path IS NOT NULL THEN
    IF p_attachment_mime <> 'image/jpeg' OR p_attachment_bytes NOT BETWEEN 1 AND 5242880
      OR p_attachment_width NOT BETWEEN 1 AND 4096 OR p_attachment_height NOT BETWEEN 1 AND 4096
      OR p_attachment_path !~* ('^companies/' || sender.company_id::TEXT || '/chat/' || p_thread_id::TEXT || '/[0-9a-f-]{36}\.jpg$')
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='chat-media' AND name=p_attachment_path)
    THEN RAISE EXCEPTION 'Invalid chat image'; END IF;
  ELSIF p_attachment_mime IS NOT NULL OR p_attachment_bytes IS NOT NULL
    OR p_attachment_width IS NOT NULL OR p_attachment_height IS NOT NULL THEN
    RAISE EXCEPTION 'Incomplete chat image';
  END IF;
  SELECT * INTO target_thread FROM public.chat_threads WHERE id = p_thread_id;
  IF target_thread.thread_type = 'direct' THEN
    receiver := CASE WHEN target_thread.participant_one_id = sender.id THEN target_thread.participant_two_id ELSE target_thread.participant_one_id END;
  END IF;
  INSERT INTO public.employee_chats(thread_id, company_id, sender_id, receiver_id, message,
    attachment_path, attachment_mime, attachment_bytes, attachment_width, attachment_height)
  VALUES (p_thread_id, sender.company_id, sender.id, receiver, clean_message,
    p_attachment_path, p_attachment_mime, p_attachment_bytes, p_attachment_width, p_attachment_height)
  RETURNING * INTO sent;
  UPDATE public.chat_threads SET last_message_id=sent.id,
    last_message_preview=CASE WHEN clean_message='' THEN 'Photo' ELSE left(clean_message,160) END,
    last_message_at=sent.created_at, updated_at=sent.created_at WHERE id=p_thread_id;
  UPDATE public.chat_thread_members SET unread_count=unread_count+1, updated_at=now()
  WHERE thread_id=p_thread_id AND employee_id<>sender.id AND removed_at IS NULL;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_thread_message_v2(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_thread_message_v2(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, INTEGER) TO authenticated;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819_generalize_chat_threads.sql
-- =========================================================================

-- Generalize the existing direct-message model for direct, group, and company chat.
-- Existing thread/message identifiers and history are preserved in place.

ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS thread_type TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.chat_threads ALTER COLUMN participant_one_id DROP NOT NULL;
ALTER TABLE public.chat_threads ALTER COLUMN participant_two_id DROP NOT NULL;

ALTER TABLE public.chat_thread_members ADD COLUMN IF NOT EXISTS member_role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.chat_thread_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.chat_thread_members ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

ALTER TABLE public.employee_chats ALTER COLUMN receiver_id DROP NOT NULL;

UPDATE public.chat_threads
SET thread_type = 'direct',
    created_by = COALESCE(created_by, participant_one_id),
    updated_at = COALESCE(last_message_at, created_at)
WHERE thread_type = 'direct';

UPDATE public.chat_thread_members AS member
SET member_role = CASE
  WHEN member.employee_id = thread.created_by THEN 'owner'
  ELSE 'member'
END
FROM public.chat_threads AS thread
WHERE thread.id = member.thread_id
  AND thread.thread_type = 'direct';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_type_check') THEN
    ALTER TABLE public.chat_threads ADD CONSTRAINT chat_threads_type_check
      CHECK (thread_type IN ('direct', 'group', 'company'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_participants_check') THEN
    ALTER TABLE public.chat_threads ADD CONSTRAINT chat_threads_participants_check
      CHECK (
        (thread_type = 'direct' AND participant_one_id IS NOT NULL AND participant_two_id IS NOT NULL)
        OR (thread_type IN ('group', 'company') AND participant_one_id IS NULL AND participant_two_id IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_members_role_check') THEN
    ALTER TABLE public.chat_thread_members ADD CONSTRAINT chat_thread_members_role_check
      CHECK (member_role IN ('owner', 'admin', 'member'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_company_channel_idx
  ON public.chat_threads(company_id)
  WHERE thread_type = 'company';
CREATE INDEX IF NOT EXISTS chat_thread_members_active_employee_idx
  ON public.chat_thread_members(employee_id, updated_at DESC, thread_id)
  WHERE removed_at IS NULL;

INSERT INTO public.chat_threads (company_id, thread_type, name, created_at, updated_at)
SELECT company.id, 'company', 'Company', now(), now()
FROM public.companies AS company
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_threads AS thread
  WHERE thread.company_id = company.id AND thread.thread_type = 'company'
);

INSERT INTO public.chat_thread_members (thread_id, employee_id, member_role)
SELECT thread.id, employee.id, 'member'
FROM public.chat_threads AS thread
JOIN public.employees AS employee ON employee.company_id = thread.company_id
WHERE thread.thread_type = 'company'
ON CONFLICT (thread_id, employee_id) DO UPDATE SET removed_at = NULL;

CREATE OR REPLACE FUNCTION public.sync_employee_company_chat_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.chat_thread_members (thread_id, employee_id, member_role)
  SELECT thread.id, NEW.id, 'member'
  FROM public.chat_threads AS thread
  WHERE thread.company_id = NEW.company_id AND thread.thread_type = 'company'
  ON CONFLICT (thread_id, employee_id) DO UPDATE SET removed_at = NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_employee_company_chat_membership() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_employee_company_chat_membership_trigger' AND NOT tgisinternal) THEN
    CREATE TRIGGER sync_employee_company_chat_membership_trigger
      AFTER INSERT OR UPDATE OF company_id ON public.employees
      FOR EACH ROW EXECUTE FUNCTION public.sync_employee_company_chat_membership();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_chat_workspace_inbox()
RETURNS TABLE (
  thread_id UUID, thread_type TEXT, display_name TEXT, picture_link TEXT,
  last_message_preview TEXT, last_message_at TIMESTAMPTZ, unread_count INTEGER,
  member_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_employee public.employees%ROWTYPE;
BEGIN
  SELECT employee.* INTO current_employee
  FROM public.employees AS employee
  JOIN public.companies AS company ON company.id = employee.company_id
  WHERE lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  LIMIT 1;
  IF current_employee.id IS NULL THEN RAISE EXCEPTION 'Chat access denied'; END IF;

  RETURN QUERY
  SELECT thread.id, thread.thread_type,
    CASE WHEN thread.thread_type = 'direct'
      THEN concat_ws(' ', other_employee.first_name, other_employee.last_name)
      ELSE COALESCE(NULLIF(thread.name, ''), 'Untitled conversation') END,
    CASE WHEN thread.thread_type = 'direct' THEN other_employee.picture_link::TEXT ELSE NULL END,
    thread.last_message_preview, thread.last_message_at, member.unread_count,
    (SELECT count(*) FROM public.chat_thread_members AS counted
      WHERE counted.thread_id = thread.id AND counted.removed_at IS NULL)
  FROM public.chat_thread_members AS member
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id
  LEFT JOIN public.employees AS other_employee ON other_employee.id = CASE
    WHEN thread.thread_type = 'direct' AND thread.participant_one_id = current_employee.id THEN thread.participant_two_id
    WHEN thread.thread_type = 'direct' THEN thread.participant_one_id ELSE NULL END
  WHERE member.employee_id = current_employee.id
    AND member.removed_at IS NULL
    AND thread.company_id = current_employee.company_id
  ORDER BY thread.last_message_at DESC NULLS LAST, thread.created_at DESC
  LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_workspace_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_workspace_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_chat_thread_messages(
  p_thread_id UUID, p_before_created_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID, thread_id UUID, sender_id UUID, sender_name TEXT,
  sender_picture TEXT, message TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_employee_id UUID;
BEGIN
  SELECT employee.id INTO current_employee_id
  FROM public.employees AS employee
  JOIN public.chat_thread_members AS member ON member.employee_id = employee.id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
    AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  LIMIT 1;
  IF current_employee_id IS NULL THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;

  RETURN QUERY
  SELECT chat.id, chat.thread_id, chat.sender_id,
    concat_ws(' ', sender.first_name, sender.last_name), sender.picture_link::TEXT,
    chat.message, chat.created_at
  FROM public.employee_chats AS chat
  JOIN public.employees AS sender ON sender.id = chat.sender_id
  WHERE chat.thread_id = p_thread_id
    AND (p_before_created_at IS NULL OR chat.created_at < p_before_created_at
      OR (chat.created_at = p_before_created_at AND chat.id < p_before_id))
  ORDER BY chat.created_at DESC, chat.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_thread_messages(UUID, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages(UUID, TIMESTAMPTZ, UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_chat_thread_members(p_thread_id UUID)
RETURNS TABLE (employee_id UUID, full_name TEXT, picture_link TEXT, member_role TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_thread_members AS mine
    JOIN public.employees AS employee ON employee.id = mine.employee_id
    JOIN public.chat_threads AS thread ON thread.id = mine.thread_id AND thread.company_id = employee.company_id
    JOIN public.companies AS company ON company.id = thread.company_id
    WHERE mine.thread_id = p_thread_id AND mine.removed_at IS NULL
      AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
      AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  ) THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  RETURN QUERY SELECT member.employee_id,
    concat_ws(' ', employee.first_name, employee.last_name), employee.picture_link::TEXT, member.member_role
  FROM public.chat_thread_members AS member
  JOIN public.employees AS employee ON employee.id = member.employee_id
  WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
  ORDER BY CASE member.member_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    employee.first_name, employee.last_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_thread_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_members(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_chat(p_name TEXT, p_member_ids UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE creator public.employees%ROWTYPE; new_thread_id UUID;
BEGIN
  SELECT employee.* INTO creator FROM public.employees AS employee
  JOIN public.companies AS company ON company.id = employee.company_id
  WHERE lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid()))) LIMIT 1;
  IF creator.id IS NULL OR nullif(btrim(p_name), '') IS NULL THEN RAISE EXCEPTION 'A group name is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_member_ids, ARRAY[]::UUID[])) AS requested(member_id)
    LEFT JOIN public.employees AS employee ON employee.id = requested.member_id
      AND employee.company_id = creator.company_id
    WHERE employee.id IS NULL
  ) THEN RAISE EXCEPTION 'Invalid group member'; END IF;
  INSERT INTO public.chat_threads(company_id, thread_type, name, created_by)
  VALUES (creator.company_id, 'group', left(btrim(p_name), 120), creator.id) RETURNING id INTO new_thread_id;
  INSERT INTO public.chat_thread_members(thread_id, employee_id, member_role)
  SELECT DISTINCT new_thread_id, member_id, CASE WHEN member_id = creator.id THEN 'owner' ELSE 'member' END
  FROM unnest(array_append(COALESCE(p_member_ids, ARRAY[]::UUID[]), creator.id)) AS member_id
  ON CONFLICT (thread_id, employee_id) DO NOTHING;
  RETURN new_thread_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_group_chat(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_chat_thread_message(p_thread_id UUID, p_message TEXT)
RETURNS public.employee_chats LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sender public.employees%ROWTYPE; target_thread public.chat_threads%ROWTYPE; receiver UUID; sent public.employee_chats%ROWTYPE;
BEGIN
  IF nullif(btrim(p_message), '') IS NULL OR length(btrim(p_message)) > 5000 THEN RAISE EXCEPTION 'Message must contain 1 to 5000 characters'; END IF;
  SELECT employee.* INTO sender FROM public.employees AS employee
  JOIN public.chat_thread_members AS member ON member.employee_id = employee.id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
    AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid()))) LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'Chat thread access denied'; END IF;
  SELECT * INTO target_thread FROM public.chat_threads WHERE id = p_thread_id;
  IF target_thread.thread_type = 'direct' THEN
    receiver := CASE WHEN target_thread.participant_one_id = sender.id THEN target_thread.participant_two_id ELSE target_thread.participant_one_id END;
  END IF;
  INSERT INTO public.employee_chats(thread_id, company_id, sender_id, receiver_id, message)
  VALUES (p_thread_id, sender.company_id, sender.id, receiver, btrim(p_message)) RETURNING * INTO sent;
  UPDATE public.chat_threads SET last_message_id = sent.id, last_message_preview = left(sent.message, 160),
    last_message_at = sent.created_at, updated_at = sent.created_at WHERE id = p_thread_id;
  UPDATE public.chat_thread_members SET unread_count = unread_count + 1, updated_at = now()
  WHERE thread_id = p_thread_id AND employee_id <> sender.id AND removed_at IS NULL;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_thread_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_thread_message(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_employee_chat_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM realtime.send(to_jsonb(NEW), 'chat_message', 'thread:' || NEW.thread_id::TEXT || ':chat', TRUE);
  PERFORM realtime.send(jsonb_build_object('thread_id', NEW.thread_id, 'sender_id', NEW.sender_id, 'created_at', NEW.created_at),
    'chat_inbox_changed', 'company:' || NEW.company_id::TEXT || ':chat', TRUE);
  IF NEW.receiver_id IS NOT NULL THEN
    PERFORM realtime.send(to_jsonb(NEW), 'chat_message', 'employee:' || NEW.sender_id::TEXT || ':chat', TRUE);
    PERFORM realtime.send(to_jsonb(NEW), 'chat_message', 'employee:' || NEW.receiver_id::TEXT || ':chat', TRUE);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_employee_chat_insert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.is_chat_thread_member(p_thread_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_thread_members AS member
    JOIN public.employees AS employee ON employee.id = member.employee_id
    JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
    JOIN public.companies AS company ON company.id = thread.company_id
    WHERE member.thread_id = p_thread_id AND member.removed_at IS NULL
      AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
      AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())))
  );
$$;
REVOKE ALL ON FUNCTION public.is_chat_thread_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_thread_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_employee_chat_unread_total()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(SUM(member.unread_count), 0)::BIGINT
  FROM public.chat_thread_members AS member
  JOIN public.employees AS employee ON employee.id = member.employee_id
  JOIN public.chat_threads AS thread ON thread.id = member.thread_id AND thread.company_id = employee.company_id
  JOIN public.companies AS company ON company.id = thread.company_id
  WHERE member.removed_at IS NULL
    AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email')
    AND company.tenant_id IN (SELECT public.get_user_tenants((SELECT auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.get_employee_chat_unread_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_chat_unread_total() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_threads' AND policyname='Members can read generalized chat threads') THEN
    CREATE POLICY "Members can read generalized chat threads" ON public.chat_threads FOR SELECT TO authenticated
      USING (public.is_chat_thread_member(chat_threads.id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='Chat members can receive thread broadcasts') THEN
    CREATE POLICY "Chat members can receive thread broadcasts" ON realtime.messages FOR SELECT TO authenticated USING (
      realtime.messages.extension = 'broadcast' AND realtime.topic() LIKE 'thread:%:chat'
      AND EXISTS (SELECT 1 FROM public.chat_thread_members AS member JOIN public.employees AS employee ON employee.id = member.employee_id
        WHERE realtime.topic() = 'thread:' || member.thread_id::TEXT || ':chat' AND member.removed_at IS NULL
          AND lower(employee.email) = lower((SELECT auth.jwt()) ->> 'email'))
    );
  END IF;
END
$$;

ALTER POLICY "Members can read generalized chat threads" ON public.chat_threads
  USING (public.is_chat_thread_member(chat_threads.id));
