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
