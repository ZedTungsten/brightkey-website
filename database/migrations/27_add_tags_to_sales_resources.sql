-- 27_add_tags_to_sales_resources.sql
ALTER TABLE public.sales_resources ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];
