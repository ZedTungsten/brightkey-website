-- Add address fields to warehouses table
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS province TEXT;
