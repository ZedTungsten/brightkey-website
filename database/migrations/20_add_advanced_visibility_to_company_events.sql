-- =============================================================================
-- 20_add_advanced_visibility_to_company_events.sql
-- Add advanced visibility options to company_events table.
-- =============================================================================

ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS visibility_type TEXT CHECK (visibility_type IN ('level', 'department', 'team', 'employee')) DEFAULT 'level';
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS visibility_departments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS visibility_teams JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS visibility_employees JSONB DEFAULT '[]'::jsonb;
