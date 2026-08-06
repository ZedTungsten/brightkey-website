-- Owners may create any number of pricing tiers, but the public pricing page
-- can expose no more than five active plans at a time. Zero active plans is valid.
CREATE OR REPLACE FUNCTION public.enforce_active_pricing_tier_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_plan_count INTEGER;
BEGIN
  IF NEW.is_visible IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- Serialize visibility changes so two simultaneous updates cannot both become
  -- the sixth active plan.
  PERFORM pg_advisory_xact_lock(hashtext('public.pricing_tiers.active_limit'));

  SELECT COUNT(*)
  INTO active_plan_count
  FROM public.pricing_tiers
  WHERE is_visible IS TRUE
    AND id IS DISTINCT FROM NEW.id;

  IF active_plan_count >= 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Only five pricing plans can be active at the same time.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_pricing_tier_limit_trigger
  ON public.pricing_tiers;

CREATE TRIGGER enforce_active_pricing_tier_limit_trigger
  BEFORE INSERT OR UPDATE OF is_visible
  ON public.pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_pricing_tier_limit();
