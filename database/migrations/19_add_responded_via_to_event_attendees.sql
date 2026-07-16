-- =============================================================================
-- 19_add_responded_via_to_event_attendees.sql
-- Add responded_via column to company_event_attendees.
-- =============================================================================

ALTER TABLE public.company_event_attendees ADD COLUMN IF NOT EXISTS responded_via TEXT CHECK (responded_via IN ('calendar', 'email')) DEFAULT 'email';
