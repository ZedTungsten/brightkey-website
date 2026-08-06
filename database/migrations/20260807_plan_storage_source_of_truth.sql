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
