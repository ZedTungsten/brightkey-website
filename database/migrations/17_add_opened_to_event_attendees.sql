-- =============================================================================
-- 17_add_opened_to_event_attendees.sql
-- Add opened tracking column to company_event_attendees table.
-- =============================================================================

ALTER TABLE public.company_event_attendees ADD COLUMN IF NOT EXISTS opened BOOLEAN DEFAULT FALSE;
