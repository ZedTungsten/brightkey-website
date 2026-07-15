-- =============================================================================
-- 18_add_email_scheduling_columns.sql
-- Add email scheduling and sent tracking columns to company_events.
-- =============================================================================

ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_scheduled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_scheduled_at TIMESTAMPTZ;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_recipients JSONB;
