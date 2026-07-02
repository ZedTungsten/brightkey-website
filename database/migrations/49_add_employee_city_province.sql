-- Migration: Add city and province columns to public.employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS province TEXT;
