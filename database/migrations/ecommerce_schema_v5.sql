-- =============================================================================
-- BrightKey Ecommerce Schema Update (v5)
-- Product Variants Structure (Parent-Child Strategy)
-- Run this in your Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS parent_sku text, -- The SKU of the base/parent product
ADD COLUMN IF NOT EXISTS variant_name text, -- e.g., 'Color', 'Direction'
ADD COLUMN IF NOT EXISTS variant_value text; -- e.g., 'Matte Black', 'Left Push'

-- Note: A product is considered a "Parent" if `parent_sku` is NULL or empty.
-- A product is considered a "Child Variant" if `parent_sku` contains the SKU of a Parent product.
