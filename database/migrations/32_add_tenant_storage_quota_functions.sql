-- Exact, tenant-scoped storage reporting and upload quota checks.
-- Storage object rows remain managed by Supabase Storage; these functions are read-only.

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

REVOKE ALL ON FUNCTION public.get_company_storage_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_company_storage_quota(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_storage_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_company_storage_quota(uuid, bigint) TO authenticated, service_role;
