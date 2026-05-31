-- Add billing_address column to public.orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS billing_address JSONB DEFAULT NULL;
