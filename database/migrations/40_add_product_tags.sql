-- Migration 40: Add tags column to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::TEXT[];
