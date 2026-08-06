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
