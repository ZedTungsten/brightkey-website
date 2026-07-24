ALTER TABLE public.business_features
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE public.business_features
SET display_name = INITCAP(REPLACE(name, '_', ' '))
WHERE display_name IS NULL OR BTRIM(display_name) = '';
