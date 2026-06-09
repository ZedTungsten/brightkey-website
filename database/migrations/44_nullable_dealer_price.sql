-- Migration 44: Allow null values in public.products.dealer_price
ALTER TABLE public.products ALTER COLUMN dealer_price DROP NOT NULL;
