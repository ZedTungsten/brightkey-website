-- Restore the bounded preflight RPC used by authenticated upload clients and
-- service-role upload APIs, and align its underlying usage authorization with
-- the authoritative tenant-owner contract used by dashboard route gates.

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
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.get_company_storage_usage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_storage_usage(UUID) TO authenticated, service_role;

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
