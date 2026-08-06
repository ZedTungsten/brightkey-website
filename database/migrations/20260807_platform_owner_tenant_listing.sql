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
