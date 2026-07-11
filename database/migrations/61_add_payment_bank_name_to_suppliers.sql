-- Migration to add payment_bank_name to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_bank_name TEXT;
