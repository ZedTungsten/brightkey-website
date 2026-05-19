-- =============================================================================
-- BrightKey Ecommerce Schema Update (v2)
-- Run this in your Supabase SQL Editor to update the existing products table
-- with JSONB columns to support the advanced CSV spreadsheet format.
-- =============================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pricing_tiers JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '{}'::jsonb;
