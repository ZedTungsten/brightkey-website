-- Business records are managed from Company Settings and feed Catalog's
-- Business and Product Features configuration.

ALTER TABLE public.tenant_businesses
  ADD COLUMN IF NOT EXISTS description VARCHAR(20) NOT NULL DEFAULT '';

ALTER TABLE public.tenant_businesses
  ALTER COLUMN name TYPE VARCHAR(20);
