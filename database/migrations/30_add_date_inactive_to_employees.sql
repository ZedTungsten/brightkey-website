-- Add date_inactive column to employees table to track when employment status is set to Inactive, Terminated, or Resigned.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS date_inactive DATE;
