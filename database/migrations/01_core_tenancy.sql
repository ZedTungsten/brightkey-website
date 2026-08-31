-- Consolidated Database Migration: 01_core_tenancy.sql
-- Generated on 2026-08-06T15:24:48.288Z


-- =========================================================================
-- SOURCE FILE: 01_core_tenancy_and_storage.sql
-- =========================================================================

-- =============================================================================
-- BrightKey Consolidated Core Tenancy & Storage Migration (01_core_tenancy_and_storage.sql)
-- Consolidates tenants, companies, tenant members, customer profiles,
-- integrations, tenant businesses/features, storage buckets, global settings,
-- and RBAC / storage quota functions.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Tenants Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email       TEXT NOT NULL,
  storage_limit_mb  INTEGER NOT NULL DEFAULT 5120, -- default 5 GB
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. Companies Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  subdomain   TEXT UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 3. Tenant Members Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role               TEXT, -- NULL for staff, 'owner' or 'admin' for executives
  accessible_modules TEXT[] DEFAULT '{}',
  user_email         TEXT,
  full_name          TEXT,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

-- ── 4. Company Invitations Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_email_tenant UNIQUE (email, tenant_id)
);

-- ── 5. Customer Profiles Table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  is_affiliate        BOOLEAN DEFAULT FALSE,
  affiliate_code      TEXT UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Tenant Businesses Table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name        VARCHAR(20) NOT NULL, -- e.g. 'Smart Lock', 'CCTV'
  description VARCHAR(20) NOT NULL DEFAULT '',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_company_business UNIQUE (company_id, name)
);

-- ── 7. Business Features Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID REFERENCES public.tenant_businesses(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL, -- e.g. 'pin_unlock'
  display_name TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_business_feature UNIQUE (business_id, name)
);

ALTER TABLE public.business_features
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ── 8. Company Integrations Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  paymongo_public_key  TEXT,
  paymongo_secret_key  TEXT,
  stripe_public_key    TEXT,
  stripe_secret_key    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_integrations' AND policyname = 'Allow tenant members integrations access'
  ) THEN
    CREATE POLICY "Allow tenant members integrations access" ON public.company_integrations
      FOR ALL TO authenticated
      USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── 9. Global Settings Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.global_settings (
  key                 TEXT NOT NULL,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  value               JSONB NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (key, company_id)
);

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'global_settings' AND policyname = 'Allow public read for settings'
  ) THEN
    CREATE POLICY "Allow public read for settings" ON public.global_settings
      FOR SELECT TO anon USING (key IN (
        'free_shipping', 'free_gifts', 'upsell_cross_sell',
        'delivery_lead_time', 'promo_popup', 'invoice_template'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'global_settings' AND policyname = 'Allow company settings write'
  ) THEN
    CREATE POLICY "Allow company settings write" ON public.global_settings
      FOR ALL USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── 10. Storage Buckets ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-media',
  'review-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png',
    'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-assets',
  'brightkey-assets',
  true,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read review-media') THEN
    CREATE POLICY "Public read review-media" ON storage.objects FOR SELECT USING (bucket_id = 'review-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read brightkey-assets') THEN
    CREATE POLICY "Public read brightkey-assets" ON storage.objects FOR SELECT USING (bucket_id = 'brightkey-assets');
  END IF;
END $$;

-- ── 11. Database Functions & RPCs ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_tenants(usr_id UUID)
RETURNS TABLE (tenant_id UUID) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = usr_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(usr_id UUID, t_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = usr_id AND tenant_id = t_id AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id    UUID,
  p_company_id UUID,
  p_module     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_modules   TEXT[];
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role, accessible_modules INTO v_role, v_modules
  FROM public.tenant_members
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_role IS NULL AND v_modules IS NULL THEN
    RETURN FALSE;
  END IF;

  IF lower(COALESCE(v_role, '')) IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_modules, ARRAY[]::TEXT[])) AS module_row(module_name)
    WHERE lower(trim(module_name)) = lower(trim(p_module))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_company_storage_usage(p_company_id uuid)
RETURNS TABLE (
  used_bytes bigint,
  file_count bigint,
  assets_bytes bigint,
  internal_bytes bigint,
  limit_bytes bigint,
  remaining_bytes bigint,
  usage_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_bytes bigint;
  v_used_bytes bigint;
  v_file_count bigint;
  v_assets_bytes bigint;
  v_internal_bytes bigint;
BEGIN
  IF auth.role() <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'email', '') <> 'johnzeustaller@gmail.com'
     AND NOT EXISTS (
       SELECT 1
       FROM public.companies c
       JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
       WHERE c.id = p_company_id
         AND tm.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'You do not have access to this company storage.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(t.storage_limit_mb, 5120)::bigint * 1024 * 1024
    INTO v_limit_bytes
  FROM public.companies c
  JOIN public.tenants t ON t.id = c.tenant_id
  WHERE c.id = p_company_id;

  IF v_limit_bytes IS NULL THEN
    RAISE EXCEPTION 'Company storage configuration was not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(SUM(CASE
      WHEN COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (o.metadata ->> 'size')::bigint ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN o.bucket_id = 'brightkey-assets'
      AND COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (o.metadata ->> 'size')::bigint ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN o.bucket_id = 'brightkey-internal'
      AND COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (o.metadata ->> 'size')::bigint ELSE 0 END), 0)
  INTO v_used_bytes, v_file_count, v_assets_bytes, v_internal_bytes
  FROM storage.objects o
  WHERE o.bucket_id IN ('brightkey-assets', 'brightkey-internal')
    AND o.name LIKE 'companies/' || p_company_id::text || '/%';

  RETURN QUERY SELECT
    v_used_bytes,
    v_file_count,
    v_assets_bytes,
    v_internal_bytes,
    v_limit_bytes,
    GREATEST(v_limit_bytes - v_used_bytes, 0),
    CASE WHEN v_limit_bytes > 0
      THEN ROUND((v_used_bytes::numeric / v_limit_bytes::numeric) * 100, 2)
      ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_company_storage_quota(
  p_company_id uuid,
  p_incoming_bytes bigint DEFAULT 0
)
RETURNS TABLE (
  allowed boolean,
  used_bytes bigint,
  incoming_bytes bigint,
  projected_bytes bigint,
  limit_bytes bigint,
  remaining_bytes bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (u.used_bytes + GREATEST(p_incoming_bytes, 0)) <= u.limit_bytes,
    u.used_bytes,
    GREATEST(p_incoming_bytes, 0),
    u.used_bytes + GREATEST(p_incoming_bytes, 0),
    u.limit_bytes,
    GREATEST(u.limit_bytes - (u.used_bytes + GREATEST(p_incoming_bytes, 0)), 0)
  FROM public.get_company_storage_usage(p_company_id) u;
$$;

CREATE OR REPLACE FUNCTION public.get_all_tenants_storage_usage()
RETURNS TABLE (tenant_id UUID, company_id UUID, bytes_used BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.tenant_id,
    c.id AS company_id,
    COALESCE(
      (
        SELECT SUM((metadata->>'size')::BIGINT)
        FROM storage.objects
        WHERE bucket_id IN ('brightkey-assets', 'brightkey-internal')
          AND name LIKE 'companies/' || c.id || '/%'
      ),
      0
    )::BIGINT AS bytes_used
  FROM public.companies c;
END;
$$;

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


-- =========================================================================
-- SOURCE FILE: 15_secure_company_invitations.sql
-- =========================================================================

ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_invitations_tenant_email
  ON public.company_invitations (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_company_invitations_token_hash
  ON public.company_invitations (token_hash)
  WHERE token_hash IS NOT NULL AND used_at IS NULL;


-- =========================================================================
-- SOURCE FILE: 20_api_rate_limits.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_scope TEXT,
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.api_rate_limits AS rate_limit (
    scope,
    key_hash,
    window_start,
    request_count
  )
  VALUES (p_scope, p_key_hash, NOW(), 1)
  ON CONFLICT (scope, key_hash)
  DO UPDATE SET
    window_start = CASE
      WHEN rate_limit.window_start <= NOW() - make_interval(secs => p_window_seconds)
        THEN NOW()
      ELSE rate_limit.window_start
    END,
    request_count = CASE
      WHEN rate_limit.window_start <= NOW() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE rate_limit.request_count + 1
    END
  RETURNING request_count INTO current_count;

  RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;


-- =========================================================================
-- SOURCE FILE: 23_security_audit_log.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_security_audit_company_created
  ON public.security_audit_log (company_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'security_audit_log'
      AND policyname = 'Tenant admins can read security audit log'
  ) THEN
    CREATE POLICY "Tenant admins can read security audit log"
      ON public.security_audit_log
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE company.id = security_audit_log.company_id
            AND member.user_id = (SELECT auth.uid())
            AND member.role IN ('owner', 'admin')
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_free_subscription_tenant_registration.sql
-- =========================================================================

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS subscription_requests_tenant_id_idx
  ON public.subscription_requests (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.register_subscription_request(
  p_pricing_tier_id UUID,
  p_plan_name TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_business_email TEXT,
  p_mobile_number TEXT,
  p_company_name TEXT,
  p_street_address TEXT,
  p_city TEXT,
  p_province TEXT,
  p_country TEXT,
  p_register_tenant BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.subscription_requests%ROWTYPE;
  v_tenant_id UUID;
  v_company_id UUID;
  v_subdomain TEXT;
BEGIN
  SELECT * INTO v_request
  FROM public.subscription_requests
  WHERE pricing_tier_id = p_pricing_tier_id
    AND LOWER(business_email) = LOWER(p_business_email)
    AND created_at >= NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_request.id IS NOT NULL THEN
    v_tenant_id := v_request.tenant_id;
    v_company_id := v_request.company_id;
  END IF;

  IF p_register_tenant AND v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (owner_email)
    VALUES (LOWER(p_business_email))
    RETURNING id INTO v_tenant_id;

    v_subdomain := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(p_company_name), '[^a-z0-9]+', '-', 'g'));
    v_subdomain := LEFT(COALESCE(NULLIF(v_subdomain, ''), 'company'), 48)
      || '-' || SUBSTRING(REPLACE(v_tenant_id::TEXT, '-', '') FROM 1 FOR 8);

    INSERT INTO public.companies (tenant_id, name, subdomain)
    VALUES (v_tenant_id, p_company_name, v_subdomain)
    RETURNING id INTO v_company_id;
  END IF;

  IF v_request.id IS NULL THEN
    INSERT INTO public.subscription_requests (
      pricing_tier_id, plan_name, first_name, last_name, business_email,
      mobile_number, company_name, street_address, city, province, country,
      consented_at, status, tenant_id, company_id
    ) VALUES (
      p_pricing_tier_id, p_plan_name, p_first_name, p_last_name, LOWER(p_business_email),
      p_mobile_number, p_company_name, p_street_address, p_city, p_province, p_country,
      NOW(), CASE WHEN p_register_tenant THEN 'converted' ELSE 'pending' END,
      v_tenant_id, v_company_id
    ) RETURNING * INTO v_request;
  ELSIF p_register_tenant AND v_request.tenant_id IS NULL THEN
    UPDATE public.subscription_requests
    SET tenant_id = v_tenant_id,
        company_id = v_company_id,
        status = 'converted',
        updated_at = NOW()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'tenant_id', v_request.tenant_id,
    'company_id', v_request.company_id,
    'duplicate', v_request.created_at < NOW() - INTERVAL '1 second'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Atomically records a plan signup and optionally provisions its tenant/company when platform payment providers are disabled.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_limit_active_pricing_tiers.sql
-- =========================================================================

-- Owners may create any number of pricing tiers, but the public pricing page
-- can expose no more than five active plans at a time. Zero active plans is valid.
CREATE OR REPLACE FUNCTION public.enforce_active_pricing_tier_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_plan_count INTEGER;
BEGIN
  IF NEW.is_visible IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- Serialize visibility changes so two simultaneous updates cannot both become
  -- the sixth active plan.
  PERFORM pg_advisory_xact_lock(hashtext('public.pricing_tiers.active_limit'));

  SELECT COUNT(*)
  INTO active_plan_count
  FROM public.pricing_tiers
  WHERE is_visible IS TRUE
    AND id IS DISTINCT FROM NEW.id;

  IF active_plan_count >= 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Only five pricing plans can be active at the same time.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_pricing_tier_limit_trigger
  ON public.pricing_tiers;

CREATE TRIGGER enforce_active_pricing_tier_limit_trigger
  BEFORE INSERT OR UPDATE OF is_visible
  ON public.pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_pricing_tier_limit();


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_plan_storage_source_of_truth.sql
-- =========================================================================

-- Pricing tiers are the source of truth for tenant storage limits.
-- The tenant column remains as a compatibility snapshot for existing quota code.

CREATE OR REPLACE FUNCTION public.apply_pricing_tier_storage_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_plan_storage_mb INTEGER;
BEGIN
  IF NEW.pricing_tier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(512, ROUND(storage_limit_gb * 1024))::INTEGER
  INTO v_plan_storage_mb
  FROM public.pricing_tiers
  WHERE id = NEW.pricing_tier_id
    AND storage_limit_gb IS NOT NULL;

  IF v_plan_storage_mb IS NOT NULL THEN
    NEW.storage_limit_mb := v_plan_storage_mb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_pricing_tier_storage_limit_trigger ON public.tenants;
CREATE TRIGGER apply_pricing_tier_storage_limit_trigger
  BEFORE INSERT OR UPDATE OF pricing_tier_id, storage_limit_mb
  ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_pricing_tier_storage_limit();

CREATE OR REPLACE FUNCTION public.sync_pricing_tier_storage_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.storage_limit_gb IS NOT NULL
     AND NEW.storage_limit_gb IS DISTINCT FROM OLD.storage_limit_gb THEN
    UPDATE public.tenants
    SET storage_limit_mb = GREATEST(512, ROUND(NEW.storage_limit_gb * 1024))::INTEGER
    WHERE pricing_tier_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pricing_tier_storage_limits_trigger ON public.pricing_tiers;
CREATE TRIGGER sync_pricing_tier_storage_limits_trigger
  AFTER UPDATE OF storage_limit_gb
  ON public.pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pricing_tier_storage_limits();

UPDATE public.tenants AS tenant
SET storage_limit_mb = GREATEST(512, ROUND(tier.storage_limit_gb * 1024))::INTEGER
FROM public.pricing_tiers AS tier
WHERE tier.id = tenant.pricing_tier_id
  AND tier.storage_limit_gb IS NOT NULL
  AND tenant.storage_limit_mb IS DISTINCT FROM
    GREATEST(512, ROUND(tier.storage_limit_gb * 1024))::INTEGER;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_platform_email_integration.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.platform_email_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider = 'resend'),
  sender_name TEXT,
  api_key TEXT,
  integration_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider)
);

ALTER TABLE public.platform_email_integrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_email_integrations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_email_integrations TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_email_integrations'
      AND policyname = 'Platform owner manages tenant signup email'
  ) THEN
    CREATE POLICY "Platform owner manages tenant signup email"
      ON public.platform_email_integrations
      FOR ALL TO authenticated
      USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com')
      WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com');
  END IF;
END $$;

COMMENT ON TABLE public.platform_email_integrations IS
  'Platform-owner Resend credentials used only for newly subscribed tenant account invitations.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_platform_owner_tenant_listing.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_platform_tenants()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) <> 'johnzeustaller@gmail.com' THEN
    RAISE EXCEPTION 'Platform owner access required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'tenants', COALESCE((
      SELECT jsonb_agg(to_jsonb(tenant_row))
      FROM (
        SELECT id, owner_email, owner_first_name, owner_last_name, mobile_number,
          street_address, city, province, country, pricing_tier_id,
          storage_limit_mb, created_at
        FROM public.tenants
        ORDER BY created_at
        LIMIT 100
      ) AS tenant_row
    ), '[]'::JSONB),
    'companies', COALESCE((
      SELECT jsonb_agg(to_jsonb(company_row))
      FROM (
        SELECT id, tenant_id, name, subdomain
        FROM public.companies
        WHERE tenant_id IN (
          SELECT id FROM public.tenants ORDER BY created_at LIMIT 100
        )
        LIMIT 100
      ) AS company_row
    ), '[]'::JSONB),
    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(plan_row))
      FROM (
        SELECT id, name, user_limit, storage_limit_gb
        FROM public.pricing_tiers
        ORDER BY price_php
        LIMIT 50
      ) AS plan_row
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_tenants() TO authenticated;

COMMENT ON FUNCTION public.get_platform_tenants() IS
  'Returns the bounded Master Settings tenant list only to the exact BrightKey platform-owner account.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_platform_subscription_payments.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.platform_payment_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('paymongo', 'stripe')),
  public_key TEXT,
  secret_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider)
);

ALTER TABLE public.platform_payment_integrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_payment_integrations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_payment_integrations TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_payment_integrations'
      AND policyname = 'Platform owner manages subscription payments'
  ) THEN
    CREATE POLICY "Platform owner manages subscription payments"
      ON public.platform_payment_integrations
      FOR ALL TO authenticated
      USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com')
      WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com');
  END IF;
END $$;

COMMENT ON TABLE public.platform_payment_integrations IS
  'Platform-owner credentials used only for BrightKey tenant plan subscription payments.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_platform_tenant_deletion.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.delete_platform_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_email TEXT;
BEGIN
  IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) <> 'johnzeustaller@gmail.com' THEN
    RAISE EXCEPTION 'Platform owner access required' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant is required' USING ERRCODE = '22004';
  END IF;

  SELECT owner_email INTO v_owner_email
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant was not found' USING ERRCODE = 'P0002';
  END IF;

  -- Protect the platform owner's active workspace while still allowing an
  -- unlinked duplicate/orphan tenant record to be removed.
  IF EXISTS (
    SELECT 1
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
  ) OR (
    LOWER(TRIM(v_owner_email)) = 'johnzeustaller@gmail.com'
    AND EXISTS (SELECT 1 FROM public.companies WHERE tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'The tenant containing your active platform-owner account cannot be deleted.'
      USING ERRCODE = '42501';
  END IF;

  -- These rows otherwise retain a null tenant through ON DELETE SET NULL and
  -- would continue blocking the email from subscribing again.
  DELETE FROM public.subscription_requests
  WHERE tenant_id = p_tenant_id
     OR company_id IN (
       SELECT id FROM public.companies WHERE tenant_id = p_tenant_id
     );

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'owner_email', v_owner_email,
    'deleted', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_platform_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_platform_tenant(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_platform_tenant(UUID) IS
  'Allows only the BrightKey platform owner to delete a tenant by ID while protecting the platform owner active workspace.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_pricing_tier_storage_limits.sql
-- =========================================================================

ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS storage_limit_gb NUMERIC(10, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pricing_tiers_storage_limit_gb_positive'
      AND conrelid = 'public.pricing_tiers'::regclass
  ) THEN
    ALTER TABLE public.pricing_tiers
      ADD CONSTRAINT pricing_tiers_storage_limit_gb_positive
      CHECK (storage_limit_gb IS NULL OR storage_limit_gb >= 0.5);
  END IF;
END $$;

COMMENT ON COLUMN public.pricing_tiers.storage_limit_gb IS
  'Maximum storage allocation in gigabytes for each tenant subscribed to this pricing tier.';

CREATE OR REPLACE FUNCTION public.register_subscription_request(
  p_pricing_tier_id UUID,
  p_plan_name TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_business_email TEXT,
  p_mobile_number TEXT,
  p_company_name TEXT,
  p_street_address TEXT,
  p_city TEXT,
  p_province TEXT,
  p_country TEXT,
  p_register_tenant BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.subscription_requests%ROWTYPE;
  v_tenant_id UUID;
  v_company_id UUID;
  v_subdomain TEXT;
  v_storage_limit_mb INTEGER;
BEGIN
  SELECT * INTO v_request
  FROM public.subscription_requests
  WHERE pricing_tier_id = p_pricing_tier_id
    AND LOWER(business_email) = LOWER(p_business_email)
    AND created_at >= NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_request.id IS NOT NULL THEN
    v_tenant_id := v_request.tenant_id;
    v_company_id := v_request.company_id;
  END IF;

  IF p_register_tenant AND v_tenant_id IS NULL THEN
    SELECT GREATEST(512, ROUND(COALESCE(storage_limit_gb, 5) * 1024))::INTEGER
    INTO v_storage_limit_mb
    FROM public.pricing_tiers
    WHERE id = p_pricing_tier_id;

    INSERT INTO public.tenants (owner_email, storage_limit_mb)
    VALUES (LOWER(p_business_email), COALESCE(v_storage_limit_mb, 5120))
    RETURNING id INTO v_tenant_id;

    v_subdomain := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(p_company_name), '[^a-z0-9]+', '-', 'g'));
    v_subdomain := LEFT(COALESCE(NULLIF(v_subdomain, ''), 'company'), 48)
      || '-' || SUBSTRING(REPLACE(v_tenant_id::TEXT, '-', '') FROM 1 FOR 8);

    INSERT INTO public.companies (tenant_id, name, subdomain)
    VALUES (v_tenant_id, p_company_name, v_subdomain)
    RETURNING id INTO v_company_id;
  END IF;

  IF v_request.id IS NULL THEN
    INSERT INTO public.subscription_requests (
      pricing_tier_id, plan_name, first_name, last_name, business_email,
      mobile_number, company_name, street_address, city, province, country,
      consented_at, status, tenant_id, company_id
    ) VALUES (
      p_pricing_tier_id, p_plan_name, p_first_name, p_last_name, LOWER(p_business_email),
      p_mobile_number, p_company_name, p_street_address, p_city, p_province, p_country,
      NOW(), CASE WHEN p_register_tenant THEN 'converted' ELSE 'pending' END,
      v_tenant_id, v_company_id
    ) RETURNING * INTO v_request;
  ELSIF p_register_tenant AND v_request.tenant_id IS NULL THEN
    UPDATE public.subscription_requests
    SET tenant_id = v_tenant_id,
        company_id = v_company_id,
        status = 'converted',
        updated_at = NOW()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'tenant_id', v_request.tenant_id,
    'company_id', v_request.company_id,
    'duplicate', v_request.created_at < NOW() - INTERVAL '1 second'
  );
END;
$$;

COMMENT ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Atomically records a plan signup and provisions its tenant/company with the plan storage limit when payments are disabled.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_pricing_tier_user_limits.sql
-- =========================================================================

ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS user_limit INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pricing_tiers_user_limit_positive'
      AND conrelid = 'public.pricing_tiers'::regclass
  ) THEN
    ALTER TABLE public.pricing_tiers
      ADD CONSTRAINT pricing_tiers_user_limit_positive
      CHECK (user_limit IS NULL OR user_limit > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.pricing_tiers.user_limit IS
  'Maximum number of tenant member accounts allowed while subscribed to this pricing tier.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_tenant_business_descriptions.sql
-- =========================================================================

-- Business records are managed from Company Settings and feed Catalog's
-- Business and Product Features configuration.

ALTER TABLE public.tenant_businesses
  ADD COLUMN IF NOT EXISTS description VARCHAR(20) NOT NULL DEFAULT '';

ALTER TABLE public.tenant_businesses
  ALTER COLUMN name TYPE VARCHAR(20);


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_tenant_subscription_profiles.sql
-- =========================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_first_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_last_name TEXT,
  ADD COLUMN IF NOT EXISTS mobile_number TEXT,
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier_id UUID REFERENCES public.pricing_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenants_pricing_tier_id_idx
  ON public.tenants (pricing_tier_id)
  WHERE pricing_tier_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_subscription_request_tenant_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storage_limit_mb INTEGER;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT CASE
    WHEN storage_limit_gb IS NULL THEN NULL
    ELSE GREATEST(512, ROUND(storage_limit_gb * 1024))::INTEGER
  END
  INTO v_storage_limit_mb
  FROM public.pricing_tiers
  WHERE id = NEW.pricing_tier_id;

  UPDATE public.tenants
  SET owner_email = LOWER(NEW.business_email),
      owner_first_name = NEW.first_name,
      owner_last_name = NEW.last_name,
      mobile_number = NEW.mobile_number,
      street_address = NEW.street_address,
      city = NEW.city,
      province = NEW.province,
      country = NEW.country,
      pricing_tier_id = NEW.pricing_tier_id,
      storage_limit_mb = COALESCE(v_storage_limit_mb, storage_limit_mb)
  WHERE id = NEW.tenant_id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_subscription_request_tenant_profile_trigger'
      AND tgrelid = 'public.subscription_requests'::regclass
  ) THEN
    CREATE TRIGGER sync_subscription_request_tenant_profile_trigger
      AFTER INSERT OR UPDATE OF tenant_id, pricing_tier_id, business_email,
        first_name, last_name, mobile_number, street_address, city, province, country
      ON public.subscription_requests
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_subscription_request_tenant_profile();
  END IF;
END $$;

UPDATE public.tenants AS tenant
SET owner_email = LOWER(request.business_email),
    owner_first_name = request.first_name,
    owner_last_name = request.last_name,
    mobile_number = request.mobile_number,
    street_address = request.street_address,
    city = request.city,
    province = request.province,
    country = request.country,
    pricing_tier_id = request.pricing_tier_id,
    storage_limit_mb = COALESCE(
      (SELECT GREATEST(512, ROUND(tier.storage_limit_gb * 1024))::INTEGER
       FROM public.pricing_tiers AS tier
       WHERE tier.id = request.pricing_tier_id
         AND tier.storage_limit_gb IS NOT NULL),
      tenant.storage_limit_mb
    )
FROM public.subscription_requests AS request
WHERE request.tenant_id = tenant.id;

CREATE OR REPLACE FUNCTION public.update_platform_tenant_profile(
  p_tenant_id UUID,
  p_company_id UUID,
  p_owner_email TEXT,
  p_owner_first_name TEXT,
  p_owner_last_name TEXT,
  p_mobile_number TEXT,
  p_company_name TEXT,
  p_street_address TEXT,
  p_city TEXT,
  p_province TEXT,
  p_country TEXT,
  p_pricing_tier_id UUID,
  p_subdomain TEXT,
  p_storage_limit_mb INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) <> 'johnzeustaller@gmail.com' THEN
    RAISE EXCEPTION 'Platform owner access required';
  END IF;
  IF p_tenant_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and company are required';
  END IF;
  IF NULLIF(TRIM(p_owner_email), '') IS NULL OR NULLIF(TRIM(p_company_name), '') IS NULL THEN
    RAISE EXCEPTION 'Owner email and company are required';
  END IF;
  IF p_storage_limit_mb < 512 THEN
    RAISE EXCEPTION 'Storage limit must be at least 512 MB';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Company does not belong to tenant';
  END IF;

  UPDATE public.tenants
  SET owner_email = LOWER(TRIM(p_owner_email)),
      owner_first_name = NULLIF(TRIM(p_owner_first_name), ''),
      owner_last_name = NULLIF(TRIM(p_owner_last_name), ''),
      mobile_number = NULLIF(TRIM(p_mobile_number), ''),
      street_address = NULLIF(TRIM(p_street_address), ''),
      city = NULLIF(TRIM(p_city), ''),
      province = NULLIF(TRIM(p_province), ''),
      country = NULLIF(TRIM(p_country), ''),
      pricing_tier_id = p_pricing_tier_id,
      storage_limit_mb = p_storage_limit_mb
  WHERE id = p_tenant_id;

  UPDATE public.companies
  SET name = TRIM(p_company_name),
      subdomain = NULLIF(LOWER(TRIM(p_subdomain)), '')
  WHERE id = p_company_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'company_id', p_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_tenant_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_tenant_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER)
  TO authenticated;

COMMENT ON FUNCTION public.update_platform_tenant_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER) IS
  'Allows only the Brightkey platform owner to atomically edit a registered tenant and its company subscription profile.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260807_unique_subscription_email.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.register_subscription_request(
  p_pricing_tier_id UUID,
  p_plan_name TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_business_email TEXT,
  p_mobile_number TEXT,
  p_company_name TEXT,
  p_street_address TEXT,
  p_city TEXT,
  p_province TEXT,
  p_country TEXT,
  p_register_tenant BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.subscription_requests%ROWTYPE;
  v_tenant_id UUID;
  v_company_id UUID;
  v_subdomain TEXT;
  v_storage_limit_mb INTEGER;
  v_email TEXT := LOWER(TRIM(p_business_email));
BEGIN
  -- Serialize signups for the same normalized email so concurrent requests
  -- cannot create two tenants before either transaction becomes visible.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  IF EXISTS (
    SELECT 1 FROM public.tenants WHERE LOWER(TRIM(owner_email)) = v_email
  ) OR EXISTS (
    SELECT 1 FROM public.subscription_requests WHERE LOWER(TRIM(business_email)) = v_email
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'This email already has a BrightKey account or subscription request.';
  END IF;

  IF p_register_tenant THEN
    SELECT GREATEST(512, ROUND(COALESCE(storage_limit_gb, 5) * 1024))::INTEGER
    INTO v_storage_limit_mb
    FROM public.pricing_tiers
    WHERE id = p_pricing_tier_id;

    INSERT INTO public.tenants (owner_email, storage_limit_mb)
    VALUES (v_email, COALESCE(v_storage_limit_mb, 5120))
    RETURNING id INTO v_tenant_id;

    v_subdomain := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(p_company_name), '[^a-z0-9]+', '-', 'g'));
    v_subdomain := LEFT(COALESCE(NULLIF(v_subdomain, ''), 'company'), 48)
      || '-' || SUBSTRING(REPLACE(v_tenant_id::TEXT, '-', '') FROM 1 FOR 8);

    INSERT INTO public.companies (tenant_id, name, subdomain)
    VALUES (v_tenant_id, p_company_name, v_subdomain)
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO public.subscription_requests (
    pricing_tier_id, plan_name, first_name, last_name, business_email,
    mobile_number, company_name, street_address, city, province, country,
    consented_at, status, tenant_id, company_id
  ) VALUES (
    p_pricing_tier_id, p_plan_name, p_first_name, p_last_name, v_email,
    p_mobile_number, p_company_name, p_street_address, p_city, p_province, p_country,
    NOW(), CASE WHEN p_register_tenant THEN 'converted' ELSE 'pending' END,
    v_tenant_id, v_company_id
  ) RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'tenant_id', v_request.tenant_id,
    'company_id', v_request.company_id,
    'duplicate', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.register_subscription_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Atomically rejects repeated plan signups by normalized email, records the subscription, and optionally provisions the tenant/company.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_authoritative_tenant_owner_authority.sql
-- =========================================================================

-- Tenant ownership is authoritative in tenants.owner_email. Core authorization
-- helpers must grant the owner full authority without requiring a duplicate
-- tenant_members row.

CREATE OR REPLACE FUNCTION public.get_user_tenants(usr_id uuid)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT member.tenant_id
  FROM public.tenant_members member
  WHERE member.user_id = usr_id
  UNION
  SELECT tenant.id
  FROM public.tenants tenant
  JOIN auth.users account ON account.id = usr_id
  WHERE lower(tenant.owner_email) = lower(account.email);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(usr_id uuid, t_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tenants tenant
      JOIN auth.users account ON account.id = usr_id
      WHERE tenant.id = t_id
        AND lower(tenant.owner_email) = lower(account.email)
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members member
      WHERE member.user_id = usr_id
        AND member.tenant_id = t_id
        AND lower(coalesce(member.role, '')) IN ('owner', 'admin', 'tenant owner')
    );
$$;

CREATE OR REPLACE FUNCTION public.has_module_access(
  p_user_id uuid,
  p_company_id uuid,
  p_module text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_modules text[];
BEGIN
  SELECT company.tenant_id INTO v_tenant_id
  FROM public.companies company
  WHERE company.id = p_company_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN RETURN false; END IF;
  IF public.is_tenant_admin(p_user_id, v_tenant_id) THEN RETURN true; END IF;

  SELECT member.role, member.accessible_modules INTO v_role, v_modules
  FROM public.tenant_members member
  WHERE member.user_id = p_user_id
    AND member.tenant_id = v_tenant_id
  LIMIT 1;

  IF lower(coalesce(v_role, '')) IN ('owner', 'admin', 'tenant owner') THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM unnest(coalesce(v_modules, ARRAY[]::text[])) AS module_row(module_name)
    WHERE lower(trim(module_name)) = lower(trim(p_module))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_tenants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_module_access(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_tenants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text) TO authenticated;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_platform_tenant_storage_deletion.sql
-- =========================================================================

-- The platform-owner deletion API must list and remove every company-scoped
-- object through the Storage API before deleting the tenant database rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Platform owner can list tenant storage'
  ) THEN
    CREATE POLICY "Platform owner can list tenant storage"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id IN ('brightkey-assets', 'brightkey-internal')
        AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Platform owner can delete tenant storage'
  ) THEN
    CREATE POLICY "Platform owner can delete tenant storage"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id IN ('brightkey-assets', 'brightkey-internal')
        AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com'
      );
  END IF;
END $$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_tenant_owner_access_without_membership.sql
-- =========================================================================

-- Tenant ownership is authoritative in tenants.owner_email. Owners must retain
-- access even when no duplicate tenant_members row exists.

CREATE OR REPLACE FUNCTION public.is_tenant_owner(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants tenant
    WHERE tenant.id = target_tenant_id
      AND lower(tenant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_company_owner(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies company
    JOIN public.tenants tenant ON tenant.id = company.tenant_id
    WHERE company.id = target_company_id
      AND lower(tenant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated;

DO $$
DECLARE
  target record;
  policy_name text;
  owner_expression text;
BEGIN
  FOR target IN
    SELECT
      table_schema,
      table_name,
      bool_or(column_name = 'tenant_id') AS has_tenant_id,
      bool_or(column_name = 'company_id') AS has_company_id
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('tenant_id', 'company_id')
      AND table_name IN (
        SELECT class.relname
        FROM pg_class class
        JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
        WHERE namespace.nspname = 'public'
          AND class.relkind = 'r'
          AND class.relrowsecurity
      )
    GROUP BY table_schema, table_name
  LOOP
    policy_name := 'Tenant owner access ' || substr(md5(target.table_name), 1, 12);
    owner_expression := CASE
      WHEN target.has_tenant_id AND target.has_company_id
        THEN '(public.is_tenant_owner(tenant_id) OR public.is_company_owner(company_id))'
      WHEN target.has_tenant_id
        THEN 'public.is_tenant_owner(tenant_id)'
      ELSE 'public.is_company_owner(company_id)'
    END;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = target.table_schema
        AND tablename = target.table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        policy_name,
        target.table_schema,
        target.table_name,
        owner_expression,
        owner_expression
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'Owners can access their tenant profile'
  ) THEN
    CREATE POLICY "Owners can access their tenant profile"
      ON public.tenants
      FOR ALL
      TO authenticated
      USING (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      WITH CHECK (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
  END IF;
END $$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260818_customer_portal_accounts.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.customer_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT NOT NULL CHECK (username = lower(username) AND username ~ '^[a-z0-9]+$'),
  phone_normalized TEXT NOT NULL CHECK (phone_normalized ~ '^[0-9]{7,15}$'),
  customer_first_name TEXT,
  customer_last_name TEXT,
  affiliate_code TEXT NOT NULL DEFAULT ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, phone_normalized),
  UNIQUE (affiliate_code)
);

ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_accounts'
      AND policyname = 'Customers read own portal account'
  ) THEN
    CREATE POLICY "Customers read own portal account"
      ON public.customer_portal_accounts
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = auth_user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS customer_portal_accounts_login_idx
  ON public.customer_portal_accounts (username, phone_normalized);
CREATE INDEX IF NOT EXISTS customer_portal_accounts_company_phone_idx
  ON public.customer_portal_accounts (company_id, phone_normalized);

GRANT SELECT ON public.customer_portal_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_portal_accounts TO service_role;
REVOKE ALL ON public.customer_portal_accounts FROM anon;

CREATE TABLE IF NOT EXISTS public.customer_portal_orders (
  account_id UUID NOT NULL REFERENCES public.customer_portal_accounts(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.installation_bookings(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, booking_id)
);

ALTER TABLE public.customer_portal_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_orders'
      AND policyname = 'Customers read own portal order links'
  ) THEN
    CREATE POLICY "Customers read own portal order links"
      ON public.customer_portal_orders
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.customer_portal_accounts AS account
        WHERE account.id = customer_portal_orders.account_id
          AND account.auth_user_id = (SELECT auth.uid())
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS customer_portal_orders_account_created_idx
  ON public.customer_portal_orders (account_id, created_at DESC);
GRANT SELECT ON public.customer_portal_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_orders TO service_role;
REVOKE ALL ON public.customer_portal_orders FROM anon;

CREATE OR REPLACE FUNCTION public.sync_customer_portal_account_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized_phone TEXT;
  resolved_first TEXT;
  resolved_last TEXT;
  generated_username TEXT;
  resolved_account_id UUID;
BEGIN
  normalized_phone := regexp_replace(COALESCE(NEW.customer_phone, ''), '[^0-9]', '', 'g');
  IF NEW.company_id IS NULL OR length(normalized_phone) < 7 OR length(normalized_phone) > 15 THEN
    RETURN NEW;
  END IF;

  resolved_first := COALESCE(NULLIF(btrim(NEW.customer_first_name), ''), split_part(btrim(COALESCE(NEW.customer_name, '')), ' ', 1));
  resolved_last := COALESCE(NULLIF(btrim(NEW.customer_last_name), ''), regexp_replace(btrim(COALESCE(NEW.customer_name, '')), '^.*\s', ''));
  generated_username := lower(regexp_replace(
    split_part(COALESCE(resolved_first, ''), ' ', 1)
    || regexp_replace(COALESCE(resolved_last, ''), '^.*\s', ''),
    '[^a-zA-Z0-9]', '', 'g'
  ));
  IF generated_username = '' THEN RETURN NEW; END IF;

  INSERT INTO public.customer_portal_accounts (
    company_id, username, phone_normalized, customer_first_name, customer_last_name, updated_at
  ) VALUES (
    NEW.company_id, generated_username, normalized_phone, resolved_first, resolved_last, NOW()
  )
  ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
    username = EXCLUDED.username,
    customer_first_name = EXCLUDED.customer_first_name,
    customer_last_name = EXCLUDED.customer_last_name,
    updated_at = NOW()
  RETURNING id INTO resolved_account_id;

  DELETE FROM public.customer_portal_orders WHERE booking_id = NEW.id;
  INSERT INTO public.customer_portal_orders (account_id, booking_id, company_id, created_at)
  VALUES (resolved_account_id, NEW.id, NEW.company_id, COALESCE(NEW.created_at, NOW()))
  ON CONFLICT (account_id, booking_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    created_at = EXCLUDED.created_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_customer_portal_account_from_booking() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_customer_portal_account_after_booking') THEN
    CREATE TRIGGER sync_customer_portal_account_after_booking
      AFTER INSERT OR UPDATE OF company_id, customer_name, customer_first_name, customer_last_name, customer_phone
      ON public.installation_bookings
      FOR EACH ROW EXECUTE FUNCTION public.sync_customer_portal_account_from_booking();
  END IF;
END
$$;

INSERT INTO public.customer_portal_accounts (
  company_id, username, phone_normalized, customer_first_name, customer_last_name
)
SELECT DISTINCT ON (booking.company_id, normalized.phone)
  booking.company_id,
  lower(regexp_replace(
    split_part(COALESCE(NULLIF(btrim(booking.customer_first_name), ''), split_part(btrim(COALESCE(booking.customer_name, '')), ' ', 1)), ' ', 1)
    || regexp_replace(COALESCE(NULLIF(btrim(booking.customer_last_name), ''), regexp_replace(btrim(COALESCE(booking.customer_name, '')), '^.*\s', '')), '^.*\s', ''),
    '[^a-zA-Z0-9]', '', 'g'
  )),
  normalized.phone,
  COALESCE(NULLIF(btrim(booking.customer_first_name), ''), split_part(btrim(COALESCE(booking.customer_name, '')), ' ', 1)),
  COALESCE(NULLIF(btrim(booking.customer_last_name), ''), regexp_replace(btrim(COALESCE(booking.customer_name, '')), '^.*\s', ''))
FROM public.installation_bookings AS booking
CROSS JOIN LATERAL (
  SELECT regexp_replace(COALESCE(booking.customer_phone, ''), '[^0-9]', '', 'g') AS phone
) AS normalized
WHERE booking.company_id IS NOT NULL
  AND length(normalized.phone) BETWEEN 7 AND 15
  AND lower(regexp_replace(
    split_part(COALESCE(NULLIF(btrim(booking.customer_first_name), ''), split_part(btrim(COALESCE(booking.customer_name, '')), ' ', 1)), ' ', 1)
    || regexp_replace(COALESCE(NULLIF(btrim(booking.customer_last_name), ''), regexp_replace(btrim(COALESCE(booking.customer_name, '')), '^.*\s', '')), '^.*\s', ''),
    '[^a-zA-Z0-9]', '', 'g'
  )) <> ''
ORDER BY booking.company_id, normalized.phone, booking.created_at DESC
ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
  username = EXCLUDED.username,
  customer_first_name = EXCLUDED.customer_first_name,
  customer_last_name = EXCLUDED.customer_last_name,
  updated_at = NOW();

INSERT INTO public.customer_portal_orders (account_id, booking_id, company_id, created_at)
SELECT account.id, booking.id, booking.company_id, COALESCE(booking.created_at, NOW())
FROM public.installation_bookings AS booking
JOIN public.customer_portal_accounts AS account
  ON account.company_id = booking.company_id
 AND account.phone_normalized = regexp_replace(COALESCE(booking.customer_phone, ''), '[^0-9]', '', 'g')
ON CONFLICT (account_id, booking_id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  created_at = EXCLUDED.created_at;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260819002132_secure_customer_portal_booking_sync.sql
-- =========================================================================

-- Portal account rows are internal synchronization state. Keep their RLS
-- policies customer-read-only and perform booking-triggered writes through a
-- guarded trigger function instead of granting dashboard users direct access.

CREATE OR REPLACE FUNCTION public.sync_customer_portal_account_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_user_id UUID := (SELECT auth.uid());
  request_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  normalized_phone TEXT;
  resolved_first TEXT;
  resolved_last TEXT;
  generated_username TEXT;
  resolved_account_id UUID;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'installation_bookings' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Customer portal synchronization is restricted to bookings.';
  END IF;

  IF caller_user_id IS NOT NULL THEN
    IF NOT public.has_module_access(caller_user_id, NEW.company_id, 'Operations') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Operations access is required to synchronize this customer account.';
    END IF;
  ELSIF request_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authenticated access is required to synchronize this customer account.';
  END IF;

  normalized_phone := regexp_replace(COALESCE(NEW.customer_phone, ''), '[^0-9]', '', 'g');
  IF NEW.company_id IS NULL OR length(normalized_phone) < 7 OR length(normalized_phone) > 15 THEN
    RETURN NEW;
  END IF;

  resolved_first := COALESCE(
    NULLIF(btrim(NEW.customer_first_name), ''),
    split_part(btrim(COALESCE(NEW.customer_name, '')), ' ', 1)
  );
  resolved_last := COALESCE(
    NULLIF(btrim(NEW.customer_last_name), ''),
    regexp_replace(btrim(COALESCE(NEW.customer_name, '')), '^.*\s', '')
  );
  generated_username := lower(regexp_replace(
    split_part(COALESCE(resolved_first, ''), ' ', 1)
      || regexp_replace(COALESCE(resolved_last, ''), '^.*\s', ''),
    '[^a-zA-Z0-9]',
    '',
    'g'
  ));
  IF generated_username = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_portal_accounts (
    company_id,
    username,
    phone_normalized,
    customer_first_name,
    customer_last_name,
    updated_at
  ) VALUES (
    NEW.company_id,
    generated_username,
    normalized_phone,
    resolved_first,
    resolved_last,
    NOW()
  )
  ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
    username = EXCLUDED.username,
    customer_first_name = EXCLUDED.customer_first_name,
    customer_last_name = EXCLUDED.customer_last_name,
    updated_at = NOW()
  RETURNING id INTO resolved_account_id;

  DELETE FROM public.customer_portal_orders
  WHERE booking_id = NEW.id;

  INSERT INTO public.customer_portal_orders (
    account_id,
    booking_id,
    company_id,
    created_at
  ) VALUES (
    resolved_account_id,
    NEW.id,
    NEW.company_id,
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (account_id, booking_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_customer_portal_account_from_booking() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_customer_portal_account_from_booking() IS
  'Synchronizes customer portal state from authorized booking writes without exposing portal account mutations through the Data API.';


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260821030000_add_platform_tenant_user_counts.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_platform_tenants()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) <> 'johnzeustaller@gmail.com' THEN
    RAISE EXCEPTION 'Platform owner access required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'tenants', COALESCE((
      SELECT jsonb_agg(to_jsonb(tenant_row))
      FROM (
        SELECT tenant.id, tenant.owner_email, tenant.owner_first_name,
          tenant.owner_last_name, tenant.mobile_number, tenant.street_address,
          tenant.city, tenant.province, tenant.country, tenant.pricing_tier_id,
          tenant.storage_limit_mb, tenant.created_at,
          (
            SELECT COUNT(DISTINCT member.user_id)
            FROM public.tenant_members member
            WHERE member.tenant_id = tenant.id
              AND member.user_id IS NOT NULL
          ) + CASE
            WHEN NULLIF(LOWER(TRIM(tenant.owner_email)), '') IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM public.tenant_members member
                LEFT JOIN auth.users account ON account.id = member.user_id
                WHERE member.tenant_id = tenant.id
                  AND member.user_id IS NOT NULL
                  AND LOWER(COALESCE(NULLIF(TRIM(member.user_email), ''), account.email, '')) =
                    LOWER(TRIM(tenant.owner_email))
              )
            THEN 1
            ELSE 0
          END AS current_user_count
        FROM public.tenants tenant
        ORDER BY tenant.created_at
        LIMIT 100
      ) AS tenant_row
    ), '[]'::JSONB),
    'companies', COALESCE((
      SELECT jsonb_agg(to_jsonb(company_row))
      FROM (
        SELECT id, tenant_id, name, subdomain
        FROM public.companies
        WHERE tenant_id IN (SELECT id FROM public.tenants ORDER BY created_at LIMIT 100)
        LIMIT 100
      ) AS company_row
    ), '[]'::JSONB),
    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(plan_row))
      FROM (
        SELECT id, name, user_limit, storage_limit_gb
        FROM public.pricing_tiers
        ORDER BY price_php
        LIMIT 50
      ) AS plan_row
    ), '[]'::JSONB)
  );
END;
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260821060000_allow_tenant_owners_manage_business_features.sql
-- =========================================================================

-- Authoritative tenant owners may manage features for businesses belonging to
-- their company even when no duplicate tenant_members row exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_features'
      AND policyname = 'Tenant owners manage business features'
  ) THEN
    CREATE POLICY "Tenant owners manage business features"
      ON public.business_features
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.tenant_businesses AS business
          WHERE business.id = business_features.business_id
            AND public.is_company_owner(business.company_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.tenant_businesses AS business
          WHERE business.id = business_features.business_id
            AND public.is_company_owner(business.company_id)
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260822010000_generate_customer_affiliate_codes.sql
-- =========================================================================

-- Generate readable customer affiliate codes without changing manually edited codes.

CREATE OR REPLACE FUNCTION public.set_generated_customer_affiliate_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base_code TEXT;
  candidate_code TEXT;
  suffix_number INTEGER := 0;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'customer_portal_accounts' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Affiliate code generation is restricted to customer portal accounts.';
  END IF;

  IF NEW.affiliate_code IS NOT NULL
     AND NEW.affiliate_code !~ '^BK-[A-F0-9]{8}$' THEN
    RETURN NEW;
  END IF;

  base_code := 'LOOCK'
    || upper(regexp_replace(COALESCE(NEW.customer_first_name, ''), '[^a-zA-Z0-9]', '', 'g'))
    || upper(left(regexp_replace(COALESCE(NEW.customer_last_name, ''), '[^a-zA-Z0-9]', '', 'g'), 1));
  IF base_code = 'LOOCK' THEN
    base_code := 'LOOCKCUSTOMER';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(base_code, 0));
  candidate_code := base_code;
  WHILE EXISTS (
    SELECT 1
    FROM public.customer_portal_accounts AS account
    WHERE account.affiliate_code = candidate_code
      AND account.id IS DISTINCT FROM NEW.id
  ) LOOP
    suffix_number := suffix_number + 1;
    candidate_code := base_code || suffix_number::TEXT;
  END LOOP;

  NEW.affiliate_code := candidate_code;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_generated_customer_affiliate_code() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_generated_customer_affiliate_code_before_insert'
      AND tgrelid = 'public.customer_portal_accounts'::regclass
  ) THEN
    CREATE TRIGGER set_generated_customer_affiliate_code_before_insert
      BEFORE INSERT ON public.customer_portal_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_generated_customer_affiliate_code();
  END IF;
END
$$;

DO $$
DECLARE
  account_row RECORD;
  base_code TEXT;
  candidate_code TEXT;
  suffix_number INTEGER;
BEGIN
  FOR account_row IN
    SELECT id, customer_first_name, customer_last_name
    FROM public.customer_portal_accounts
    WHERE affiliate_code ~ '^BK-[A-F0-9]{8}$'
    ORDER BY created_at, id
  LOOP
    base_code := 'LOOCK'
      || upper(regexp_replace(COALESCE(account_row.customer_first_name, ''), '[^a-zA-Z0-9]', '', 'g'))
      || upper(left(regexp_replace(COALESCE(account_row.customer_last_name, ''), '[^a-zA-Z0-9]', '', 'g'), 1));
    IF base_code = 'LOOCK' THEN base_code := 'LOOCKCUSTOMER'; END IF;
    candidate_code := base_code;
    suffix_number := 0;
    WHILE EXISTS (
      SELECT 1 FROM public.customer_portal_accounts AS existing
      WHERE existing.affiliate_code = candidate_code
        AND existing.id <> account_row.id
    ) LOOP
      suffix_number := suffix_number + 1;
      candidate_code := base_code || suffix_number::TEXT;
    END LOOP;
    UPDATE public.customer_portal_accounts
    SET affiliate_code = candidate_code, updated_at = NOW()
    WHERE id = account_row.id;
  END LOOP;
END
$$;

COMMENT ON FUNCTION public.set_generated_customer_affiliate_code() IS
  'Assigns LOOCK{FIRSTNAME}{LASTINITIAL} affiliate codes, adding a numeric suffix only for duplicates.';
