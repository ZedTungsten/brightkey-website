-- Migration: Add dealer_price column to public.products table
-- Run this in the Supabase SQL Editor

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dealer_price INTEGER NOT NULL DEFAULT 0;

-- Backfill existing products' dealer_price with 75% of sale_price (rounded to integer centavos)
UPDATE public.products SET dealer_price = ROUND(sale_price * 0.75) WHERE dealer_price = 0;
