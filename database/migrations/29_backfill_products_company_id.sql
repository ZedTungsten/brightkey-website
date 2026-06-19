-- Backfill product company_id for the seeded products to match the 'BrightKey' company
UPDATE public.products
SET company_id = (SELECT id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1)
WHERE company_id IS NULL;
