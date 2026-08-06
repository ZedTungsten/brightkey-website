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
