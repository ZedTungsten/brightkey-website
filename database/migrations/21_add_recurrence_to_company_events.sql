-- =============================================================================
-- 21_add_recurrence_to_company_events.sql
-- Add recurrence settings to company_events table.
-- =============================================================================

ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT CHECK (recurrence_pattern IN ('weekly', 'monthly', 'annual'));
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS recurrence_days JSONB DEFAULT '[]'::jsonb;
