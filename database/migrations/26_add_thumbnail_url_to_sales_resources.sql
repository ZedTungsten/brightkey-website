-- 26_add_thumbnail_url_to_sales_resources.sql
-- Add thumbnail_url column to public.sales_resources to support saving pre-generated thumbnails on upload.

ALTER TABLE public.sales_resources ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
