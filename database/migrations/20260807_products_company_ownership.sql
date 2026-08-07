-- Ensure every product has explicit company ownership so catalog records can
-- never appear through a legacy NULL-owner compatibility query.

DO $$
DECLARE
  brightkey_company_id CONSTANT UUID := 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = brightkey_company_id
      AND name = 'BrightKey'
  ) THEN
    RAISE EXCEPTION 'Expected BrightKey company was not found; product ownership was not changed.';
  END IF;

  UPDATE public.products
  SET company_id = brightkey_company_id
  WHERE id IN (
    '4b25f102-aa2b-477b-8dc0-065f787222ae',
    'c2e6fd99-7fe7-49be-a879-824f16c51174'
  )
    AND sku IN ('OCULAR', 'ADD-ON LABOR')
    AND company_id IS NULL;

  IF EXISTS (SELECT 1 FROM public.products WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Products with missing company ownership remain; NOT NULL was not applied.';
  END IF;
END
$$;

ALTER TABLE public.products
  ALTER COLUMN company_id SET NOT NULL;
