-- Add tin column to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tin TEXT;
