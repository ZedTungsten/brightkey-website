-- =============================================================================
-- 12_email_subtabs_integrations.sql
-- Non-destructive schema updates to support category-specific (HR, Marketing,
-- General) email sending settings, including sender names and SMTP credentials.
-- =============================================================================

-- ── 1. HR Subtab Email Configuration ─────────────────────────────────────────
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_sender_name TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_resend_api_key TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_resend_from_email TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_smtp_host TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_smtp_port INTEGER;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_smtp_user TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS hr_smtp_pass TEXT;

-- ── 2. Marketing Subtab Email Configuration ──────────────────────────────────
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_sender_name TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_resend_api_key TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_resend_from_email TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_smtp_host TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_smtp_port INTEGER;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_smtp_user TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS marketing_smtp_pass TEXT;

-- ── 3. General Subtab Email Configuration ────────────────────────────────────
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_sender_name TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_resend_api_key TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_resend_from_email TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_smtp_host TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_smtp_port INTEGER;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_smtp_user TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS general_smtp_pass TEXT;
