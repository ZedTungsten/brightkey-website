-- Add notes column to employees for cross-device sticky notes syncing
ALTER TABLE public.employees ADD COLUMN notes TEXT;
