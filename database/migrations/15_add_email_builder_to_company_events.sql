-- =============================================================================
-- 15_add_email_builder_to_company_events.sql
-- Non-destructive alteration of company_events to store event-specific email builder settings.
-- =============================================================================

ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_sender_name TEXT;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_sender_email TEXT;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_preheader TEXT;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_body_json JSONB;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_settings JSONB;
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS email_attendee_response BOOLEAN DEFAULT TRUE;
