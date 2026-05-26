-- Migration: Add promo_tags to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS promo_tags TEXT[];
