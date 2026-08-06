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
       JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
       WHERE c.id = p_company_id
         AND tm.user_id = auth.uid()
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
