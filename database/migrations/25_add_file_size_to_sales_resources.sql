-- 25_add_file_size_to_sales_resources.sql
-- Add file_size column to public.sales_resources to support displaying file sizes in list view mode.

ALTER TABLE public.sales_resources ADD COLUMN IF NOT EXISTS file_size INTEGER;
