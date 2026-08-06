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
  name        TEXT NOT NULL, -- e.g. 'Smart Lock', 'CCTV'
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
      FOR SELECT USING (true);
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
WITH (security_invoker = true)
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
