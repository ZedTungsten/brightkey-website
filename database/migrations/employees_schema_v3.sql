-- =============================================================================
-- BrightKey Employees Schema (v3 — add employment_status column & delete policy)
-- Run this in your Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'Active';

-- Enable DELETE policy for employees table
DROP POLICY IF EXISTS "Allow public delete" ON public.employees;
CREATE POLICY "Allow public delete" 
  ON public.employees FOR DELETE 
  USING (true);
