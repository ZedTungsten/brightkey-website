-- =============================================================================
-- Migration 24: Add Payout Details and Payout Details Image columns to Employees
-- =============================================================================

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS payout_details TEXT,
ADD COLUMN IF NOT EXISTS payout_details_image TEXT;
