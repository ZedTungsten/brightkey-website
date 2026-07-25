-- =============================================================================
-- BrightKey Consolidated Marketing & Events Migration (05_marketing_and_events.sql)
-- Consolidates marketing audiences, campaigns, templates, coupons, marketing logs,
-- sales resources, company events, event attendees, Meta Messenger, and functions.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Marketing Audiences & Contacts Tables ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_audience (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  email               TEXT UNIQUE NOT NULL,
  source              TEXT NOT NULL DEFAULT 'promo_popup',
  first_name          TEXT,
  last_name           TEXT,
  phone               TEXT,
  country             TEXT DEFAULT 'Philippines',
  address             TEXT,
  city                TEXT,
  zip_code            TEXT,
  audience            TEXT DEFAULT 'Customer',
  value               TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_marketing_audiences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_marketing_audience_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  audience_id   UUID REFERENCES public.email_marketing_audiences(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'promo_popup',
  first_name    TEXT,
  last_name     TEXT,
  phone         TEXT,
  city          TEXT,
  address       TEXT,
  zip_code      TEXT,
  country       TEXT DEFAULT 'Philippines',
  is_subscribed BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_audience_email UNIQUE (audience_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  subject             TEXT NOT NULL,
  body_html           TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  code                TEXT NOT NULL,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value      INTEGER NOT NULL, -- percentage or centavos
  min_spend           INTEGER DEFAULT 0,
  max_discount        INTEGER,
  usage_limit         INTEGER,
  usage_count         INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_coupon_code UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.marketing_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  action              TEXT NOT NULL,
  details             JSONB DEFAULT '{}'::JSONB,
  performed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Sales Resources Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_resources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  category            TEXT,
  file_url            TEXT NOT NULL,
  file_size_bytes     BIGINT,
  thumbnail_url       TEXT,
  tags                TEXT[] DEFAULT '{}',
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ── 3. Company Events & Attendees Tables ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  event_type          TEXT DEFAULT 'general',
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  location            TEXT,
  meeting_link        TEXT,
  organizer_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_all_day          BOOLEAN DEFAULT FALSE,
  color               TEXT DEFAULT '#06b6d4',
  target_departments  TEXT[] DEFAULT '{}',
  target_roles        TEXT[] DEFAULT '{}',
  recurrence_pattern  TEXT DEFAULT 'none',
  recurrence_interval INTEGER DEFAULT 1,
  recurrence_end_date DATE,
  recurring_source_id UUID REFERENCES public.company_events(id) ON DELETE SET NULL,
  send_email_invite   BOOLEAN DEFAULT FALSE,
  email_subject       TEXT,
  email_body_template TEXT,
  scheduled_email_at  TIMESTAMPTZ,
  email_status        TEXT DEFAULT 'draft',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_events
  ADD COLUMN IF NOT EXISTS target_departments TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_roles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurring_source_id UUID REFERENCES public.company_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_email_invite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_body_template TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'draft';

CREATE TABLE IF NOT EXISTS public.company_event_attendees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID REFERENCES public.company_events(id) ON DELETE CASCADE NOT NULL,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  rsvp_status         TEXT DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined', 'tentative')),
  opened_at           TIMESTAMPTZ,
  responded_via       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_event_attendees
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_via TEXT;

-- ── 4. Meta Messenger Tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sender_psid         TEXT NOT NULL,
  page_id             TEXT NOT NULL,
  customer_name       TEXT,
  customer_profile_pic TEXT,
  last_message        TEXT,
  last_message_at     TIMESTAMPTZ DEFAULT NOW(),
  unread_count        INTEGER DEFAULT 0,
  assigned_to         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_sender_page UNIQUE (company_id, sender_psid, page_id)
);

CREATE TABLE IF NOT EXISTS public.meta_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID REFERENCES public.meta_conversations(id) ON DELETE CASCADE NOT NULL,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  mid                 TEXT UNIQUE,
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
  message_text        TEXT,
  attachments         JSONB DEFAULT '[]'::JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Functions & Triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_company_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_company_events_updated_at_trg ON public.company_events;
CREATE TRIGGER set_company_events_updated_at_trg
  BEFORE UPDATE ON public.company_events
  FOR EACH ROW EXECUTE FUNCTION public.set_company_events_updated_at();

CREATE OR REPLACE FUNCTION public.set_company_event_attendees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_company_event_attendees_updated_at_trg ON public.company_event_attendees;
CREATE TRIGGER set_company_event_attendees_updated_at_trg
  BEFORE UPDATE ON public.company_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_company_event_attendees_updated_at();
