-- Migration 43: Add product settings toggles for ecommerce visibility, inventory counting, and page section displays.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_on_ecommerce boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS count_inventory boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_features boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_specs boolean NOT NULL DEFAULT true;
