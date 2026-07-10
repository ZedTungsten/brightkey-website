-- Add additional contact number and email to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_number_2 TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email_2 TEXT;
