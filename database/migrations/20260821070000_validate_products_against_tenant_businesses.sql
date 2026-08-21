-- Product business keys come from each company's configured tenant businesses.
-- Replace the legacy four-value constraint with tenant-scoped validation.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_business_check;

CREATE OR REPLACE FUNCTION public.validate_product_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.business IS NOT DISTINCT FROM OLD.business THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_businesses AS business
    WHERE business.company_id = NEW.company_id
      AND lower(regexp_replace(business.name, '[[:space:]_.-]+', '_', 'g')) = NEW.business
  ) THEN
    RAISE EXCEPTION 'Select a business configured for this company.'
      USING ERRCODE = '23514',
            CONSTRAINT = 'products_business_company_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_product_business_trigger ON public.products;
CREATE TRIGGER validate_product_business_trigger
  BEFORE INSERT OR UPDATE OF company_id, business ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_business();
