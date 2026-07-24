-- Add general product specification fields without replacing existing data.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS spec_model TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS spec_color TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS spec_weight TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS spec_operating_temperature TEXT;
