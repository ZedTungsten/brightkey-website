-- Add customer_city and customer_province to installation_bookings table
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS customer_city TEXT;
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS customer_province TEXT;
