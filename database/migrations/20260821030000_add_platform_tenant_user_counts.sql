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
