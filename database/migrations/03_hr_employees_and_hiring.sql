-- =============================================================================
-- BrightKey Consolidated HR, Employees & Hiring Migration (03_hr_employees_and_hiring.sql)
-- Consolidates employees, date_inactive, attendance, leave requests, payroll,
-- job_posts (Hiring), employee chat threads & messages, presence views, and functions.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Sequence for auto-incrementing employee counter ────────────────────────
CREATE SEQUENCE IF NOT EXISTS employee_counter_seq START 1;

-- ── 2. Main Employees Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  employee_number     TEXT UNIQUE NOT NULL,

  -- Personal Information
  first_name          TEXT NOT NULL,
  middle_name         TEXT,
  last_name           TEXT NOT NULL,
  date_of_birth       DATE NOT NULL,
  address             TEXT NOT NULL,
  contact_number      TEXT NOT NULL,
  emergency_contact   TEXT NOT NULL,
  email_address       TEXT NOT NULL,

  -- Uploaded Documents (CDN URLs)
  profile_picture_url TEXT,
  government_id_url   TEXT,
  cv_url              TEXT,

  -- Optional Government IDs
  tin_number          TEXT,
  sss_number          TEXT,
  pagibig_number      TEXT,
  philhealth_number   TEXT,

  -- HR / Admin Fields
  department          TEXT,
  position            TEXT,
  level               TEXT,
  reporting_to        TEXT,
  job_description     TEXT,
  employment_type     TEXT,
  employment_status   TEXT DEFAULT 'Active',
  date_hired          DATE,
  date_regularized    DATE,
  date_inactive       DATE,
  salary              NUMERIC(12, 2),
  bank_name           TEXT,
  bank_account_number TEXT,
  
  -- Leave credits
  vl_load             NUMERIC(6,2) DEFAULT 0,
  sl_load             NUMERIC(6,2) DEFAULT 0,
  
  -- Profile Customization Columns
  status_text         VARCHAR(150) DEFAULT NULL,
  cover_photo_link    TEXT DEFAULT NULL,
  cover_text_color    VARCHAR(10) DEFAULT 'white',

  -- Shift Scheduling Columns
  shift_days          VARCHAR(50) DEFAULT NULL,
  shift_time_1        VARCHAR(50) DEFAULT NULL,
  shift_time_2        VARCHAR(50) DEFAULT NULL,

  -- Payout Details
  payout_details      TEXT,
  payout_details_image TEXT,

  notes               TEXT,

  -- Metadata
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS date_inactive DATE;

-- ── 3. Attendance Logs Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type                TEXT NOT NULL CHECK (type IN ('Clock In', 'Clock Out', 'Break In', 'Break Out')),
  photo_url           TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Leave Requests Table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  leave_type          TEXT NOT NULL, -- e.g. 'Vacation', 'Sick', 'Emergency'
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  reason              TEXT,
  status              TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  approved_by         UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Job Posts Table (Hiring Module) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_posts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employment_type       TEXT NOT NULL CHECK (employment_type IN ('regular', 'project_based')),
  position              TEXT,
  department_name       TEXT,
  team_name             TEXT,
  assignee_id           UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  position_type         TEXT CHECK (position_type IS NULL OR position_type IN ('member', 'manager')),
  visibility_level      INTEGER CHECK (visibility_level BETWEEN 1 AND 4),
  job_title             VARCHAR(100) NOT NULL,
  job_description       VARCHAR(500) NOT NULL,
  qualifications        JSONB NOT NULL DEFAULT '[]'::JSONB,
  responsibilities      JSONB NOT NULL DEFAULT '{"daily":[],"weekly":[],"monthly":[]}'::JSONB,
  milestones            JSONB NOT NULL DEFAULT '[]'::JSONB,
  project_length        TEXT CHECK (project_length IS NULL OR project_length IN ('short', 'intermediate', 'long')),
  fixed_price           NUMERIC(14,2) CHECK (fixed_price IS NULL OR fixed_price >= 0),
  monthly_salary        NUMERIC(14,2) CHECK (monthly_salary IS NULL OR monthly_salary >= 0),
  salary_confidential   BOOLEAN NOT NULL DEFAULT FALSE,
  salary_negotiable     BOOLEAN NOT NULL DEFAULT FALSE,
  compensation_extras   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  benefits              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reporting_days        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reporting_time_start  TIME,
  reporting_time_end    TIME,
  free_hours            BOOLEAN NOT NULL DEFAULT FALSE,
  reporting_mode        TEXT CHECK (reporting_mode IS NULL OR reporting_mode IN ('remote', 'hybrid', 'on_site', 'online', 'office')),
  location_scope        TEXT NOT NULL DEFAULT 'everywhere' CHECK (location_scope IN ('everywhere', 'specific')),
  location_country      TEXT,
  location_city         TEXT,
  applicant_type        TEXT CHECK (applicant_type IS NULL OR applicant_type IN ('agency', 'team', 'individual')),
  expertise_level       TEXT CHECK (expertise_level IS NULL OR expertise_level IN ('entry_level', 'intermediate', 'expert')),
  vacancy_count         INTEGER NOT NULL DEFAULT 1 CHECK (vacancy_count > 0),
  expected_start_date   DATE,
  tags                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status                TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'closed')),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Employee Chat Tables ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_chat_threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_a              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_chat_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES public.employee_chat_threads(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message             TEXT NOT NULL,
  attachment_url      TEXT,
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Functions & Triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();

CREATE OR REPLACE FUNCTION generate_employee_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.employee_number IS NULL OR NEW.employee_number = '' THEN
    NEW.employee_number := 'EMP-' || LPAD(NEXTVAL('employee_counter_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_employee_number ON public.employees;
CREATE TRIGGER trg_generate_employee_number
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION generate_employee_number();

CREATE OR REPLACE FUNCTION public.set_job_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_job_posts_updated_at_trigger ON public.job_posts;
CREATE TRIGGER set_job_posts_updated_at_trigger
  BEFORE UPDATE ON public.job_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_job_posts_updated_at();

-- ── Employee Chat Functions ──

CREATE OR REPLACE FUNCTION public.send_employee_chat(
  p_recipient_id UUID,
  p_message TEXT,
  p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender_id UUID;
  v_company_id UUID;
  v_thread_id UUID;
  v_msg_id UUID;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
  WHERE tm.user_id = v_sender_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company not found for user.';
  END IF;

  SELECT id INTO v_thread_id
  FROM public.employee_chat_threads
  WHERE company_id = v_company_id
    AND ((user_a = v_sender_id AND user_b = p_recipient_id) OR (user_a = p_recipient_id AND user_b = v_sender_id))
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.employee_chat_threads (company_id, user_a, user_b, last_message_at)
    VALUES (v_company_id, LEAST(v_sender_id, p_recipient_id), GREATEST(v_sender_id, p_recipient_id), NOW())
    RETURNING id INTO v_thread_id;
  ELSE
    UPDATE public.employee_chat_threads
    SET last_message_at = NOW()
    WHERE id = v_thread_id;
  END IF;

  INSERT INTO public.employee_chat_messages (thread_id, company_id, sender_id, message, attachment_url)
  VALUES (v_thread_id, v_company_id, v_sender_id, p_message, p_attachment_url)
  RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object(
    'thread_id', v_thread_id,
    'message_id', v_msg_id,
    'sender_id', v_sender_id,
    'recipient_id', p_recipient_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_chat_thread_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  UPDATE public.employee_chat_messages
  SET is_read = TRUE, read_at = NOW()
  WHERE thread_id = p_thread_id
    AND sender_id <> v_user_id
    AND is_read = FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_chat_inbox()
RETURNS TABLE (
  thread_id UUID,
  other_user_id UUID,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT 
    t.id AS thread_id,
    CASE WHEN t.user_a = v_user_id THEN t.user_b ELSE t.user_a END AS other_user_id,
    (SELECT m.message FROM public.employee_chat_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
    t.last_message_at,
    (SELECT COUNT(*) FROM public.employee_chat_messages m WHERE m.thread_id = t.id AND m.sender_id <> v_user_id AND m.is_read = FALSE) AS unread_count
  FROM public.employee_chat_threads t
  WHERE t.user_a = v_user_id OR t.user_b = v_user_id
  ORDER BY t.last_message_at DESC;
END;
$$;
