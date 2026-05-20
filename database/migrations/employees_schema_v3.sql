-- =============================================================================
-- BrightKey Employees Schema (v3 — add employment_status column)
-- Run this in your Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'Active';
