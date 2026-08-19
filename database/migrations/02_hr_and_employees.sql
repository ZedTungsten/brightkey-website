-- Consolidated Database Migration: 02_hr_and_employees.sql
-- Generated on 2026-08-06T15:24:48.290Z


-- =========================================================================
-- SOURCE FILE: 03_hr_employees_and_hiring.sql
-- =========================================================================

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


-- =========================================================================
-- SOURCE FILE: 26_restore_tenant_employee_visibility.sql
-- =========================================================================

-- =============================================================================
-- Restore coworker visibility for authenticated users within the same tenant.
-- This supports profiles, chat, schedules, assignments, and performance views
-- without restoring anonymous or cross-tenant employee access.
-- =============================================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'Tenant members can view company employees'
  ) THEN
    CREATE POLICY "Tenant members can view company employees"
      ON public.employees
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company.id
          FROM public.companies company
          JOIN public.tenant_members member
            ON member.tenant_id = company.tenant_id
          WHERE member.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END;
$$;


-- =========================================================================
-- SOURCE FILE: 32_direct_manager_leave_decisions.sql
-- =========================================================================

-- Direct managers can decide pending leave requests for their own reports.
-- Approval and leave-load deduction happen atomically in one transaction.

CREATE OR REPLACE FUNCTION public.decide_direct_report_leave_request(
  p_request_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  request_id UUID,
  request_status TEXT,
  vacation_leave_load NUMERIC,
  sick_leave_load NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manager public.employees%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_request public.leave_requests%ROWTYPE;
  v_decision TEXT := lower(trim(coalesce(p_decision, '')));
  v_days NUMERIC;
BEGIN
  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid leave request decision';
  END IF;

  SELECT employee.*
  INTO v_manager
  FROM public.employees employee
  JOIN auth.users account
    ON lower(account.email) = lower(employee.email)
  WHERE account.id = auth.uid()
    AND lower(coalesce(employee.employment_status, '')) = 'active'
  LIMIT 1;

  IF v_manager.id IS NULL THEN
    RAISE EXCEPTION 'Active manager profile not found';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.leave_requests request
  WHERE request.id = p_request_id
    AND request.company_id = v_manager.company_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;

  IF lower(coalesce(v_request.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Leave request has already been decided';
  END IF;

  SELECT employee.*
  INTO v_employee
  FROM public.employees employee
  WHERE employee.id = v_request.employee_id
    AND employee.company_id = v_manager.company_id
  FOR UPDATE;

  IF v_employee.id IS NULL OR v_employee.reporting_to IS DISTINCT FROM v_manager.id THEN
    RAISE EXCEPTION 'Only the employee''s direct manager can decide this request';
  END IF;

  v_days := greatest(coalesce(v_request.number_of_days, 0), 0);

  IF v_decision = 'approved' THEN
    IF lower(coalesce(v_request.leave_type, '')) = 'vacation' THEN
      IF coalesce(v_employee.vl_load, 0) < v_days THEN
        RAISE EXCEPTION 'Employee has insufficient vacation leave balance';
      END IF;

      UPDATE public.employees
      SET vl_load = coalesce(vl_load, 0) - v_days,
          updated_at = now()
      WHERE id = v_employee.id
        AND company_id = v_manager.company_id;
    ELSIF lower(coalesce(v_request.leave_type, '')) = 'sick' THEN
      IF coalesce(v_employee.sl_load, 0) < v_days THEN
        RAISE EXCEPTION 'Employee has insufficient sick leave balance';
      END IF;

      UPDATE public.employees
      SET sl_load = coalesce(sl_load, 0) - v_days,
          updated_at = now()
      WHERE id = v_employee.id
        AND company_id = v_manager.company_id;
    ELSE
      RAISE EXCEPTION 'Unsupported leave type';
    END IF;

    UPDATE public.leave_requests
    SET status = 'approved'
    WHERE id = v_request.id
      AND company_id = v_manager.company_id;
  ELSE
    IF nullif(trim(coalesce(p_rejection_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required';
    END IF;

    UPDATE public.leave_requests
    SET status = 'rejected',
        rejected_reason = trim(p_rejection_reason)
    WHERE id = v_request.id
      AND company_id = v_manager.company_id;
  END IF;

  RETURN QUERY
  SELECT
    v_request.id,
    v_decision,
    employee.vl_load,
    employee.sl_load
  FROM public.employees employee
  WHERE employee.id = v_employee.id
    AND employee.company_id = v_manager.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_direct_report_leave_request(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_direct_report_leave_request(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 33_public_job_post_codes.sql
-- =========================================================================

-- Stable public job URLs and narrow read-only access for posted vacancies.

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS public_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_job_post_public_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
BEGIN
  LOOP
    v_code := translate(
      rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='),
      '+/',
      '-_'
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.job_posts
      WHERE public_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

DO $$
DECLARE
  v_job_id UUID;
BEGIN
  FOR v_job_id IN
    SELECT id
    FROM public.job_posts
    WHERE public_code IS NULL OR public_code = ''
  LOOP
    UPDATE public.job_posts
    SET public_code = public.generate_job_post_public_code()
    WHERE id = v_job_id;
  END LOOP;
END;
$$;

ALTER TABLE public.job_posts
  ALTER COLUMN public_code SET DEFAULT public.generate_job_post_public_code();

ALTER TABLE public.job_posts
  ALTER COLUMN public_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_posts_public_code_uidx
  ON public.job_posts (public_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_public_code_format'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_public_code_format
      CHECK (public_code ~ '^[A-Za-z0-9_-]+$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_job_posts(p_company_id UUID)
RETURNS TABLE (
  public_code TEXT,
  job_title TEXT,
  job_description TEXT,
  employment_type TEXT,
  department_name TEXT,
  team_name TEXT,
  reporting_mode TEXT,
  location_scope TEXT,
  location_country TEXT,
  location_city TEXT,
  expertise_level TEXT,
  vacancy_count INTEGER,
  expected_start_date DATE,
  tags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.public_code,
    job.job_title::TEXT,
    job.job_description::TEXT,
    job.employment_type,
    job.department_name,
    job.team_name,
    job.reporting_mode,
    job.location_scope,
    job.location_country,
    job.location_city,
    job.expertise_level,
    job.vacancy_count,
    job.expected_start_date,
    job.tags,
    job.created_at
  FROM public.job_posts job
  WHERE job.company_id = p_company_id
    AND job.status = 'posted'
  ORDER BY job.created_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_public_job_post(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  public_code TEXT,
  employment_type TEXT,
  position_name TEXT,
  department_name TEXT,
  team_name TEXT,
  position_type TEXT,
  job_title TEXT,
  job_description TEXT,
  qualifications JSONB,
  responsibilities JSONB,
  milestones JSONB,
  project_length TEXT,
  fixed_price NUMERIC,
  monthly_salary NUMERIC,
  salary_confidential BOOLEAN,
  salary_negotiable BOOLEAN,
  compensation_extras TEXT[],
  benefits TEXT[],
  reporting_days TEXT[],
  reporting_time_start TIME,
  reporting_time_end TIME,
  free_hours BOOLEAN,
  reporting_mode TEXT,
  location_scope TEXT,
  location_country TEXT,
  location_city TEXT,
  applicant_type TEXT,
  expertise_level TEXT,
  vacancy_count INTEGER,
  expected_start_date DATE,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.public_code,
    job.employment_type,
    job.position,
    job.department_name,
    job.team_name,
    job.position_type,
    job.job_title::TEXT,
    job.job_description::TEXT,
    job.qualifications,
    job.responsibilities,
    job.milestones,
    job.project_length,
    job.fixed_price,
    job.monthly_salary,
    job.salary_confidential,
    job.salary_negotiable,
    job.compensation_extras,
    job.benefits,
    job.reporting_days,
    job.reporting_time_start,
    job.reporting_time_end,
    job.free_hours,
    job.reporting_mode,
    job.location_scope,
    job.location_country,
    job.location_city,
    job.applicant_type,
    job.expertise_level,
    job.vacancy_count,
    job.expected_start_date,
    job.tags,
    job.created_at,
    job.updated_at
  FROM public.job_posts job
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.generate_job_post_public_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_job_posts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_job_post(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_job_posts(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_job_post(UUID, TEXT) TO anon, authenticated;


-- =========================================================================
-- SOURCE FILE: 35_public_job_post_template.sql
-- =========================================================================

-- Expose only the approved, public-facing job header image configuration.
-- This keeps the rest of the hiring template configuration private.

CREATE OR REPLACE FUNCTION public.get_public_job_post_template(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  header_image_url TEXT,
  header_image_position_y INTEGER,
  header_image_zoom INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NULLIF(settings.value -> job.id::TEXT ->> 'headerImageUrl', '') AS header_image_url,
    LEAST(100, GREATEST(0, COALESCE((settings.value -> job.id::TEXT ->> 'positionY')::INTEGER, 50)))
      AS header_image_position_y,
    LEAST(200, GREATEST(100, COALESCE((settings.value -> job.id::TEXT ->> 'zoom')::INTEGER, 100)))
      AS header_image_zoom
  FROM public.job_posts AS job
  LEFT JOIN public.global_settings AS settings
    ON settings.company_id = job.company_id
    AND settings.key = 'job_post_template_config'
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job_post_template(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_post_template(UUID, TEXT) TO anon, authenticated;


-- =========================================================================
-- SOURCE FILE: 36_compact_job_post_public_codes.sql
-- =========================================================================

-- Compact public job URLs: exactly five URL-safe characters.
-- Existing codes are regenerated before the stricter constraint is validated.

CREATE OR REPLACE FUNCTION public.generate_job_post_public_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
BEGIN
  LOOP
    v_code := substring(translate(
      rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='),
      '+/',
      '-_'
    ) FROM 1 FOR 5);

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.job_posts
      WHERE public_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

ALTER TABLE public.job_posts
  ALTER COLUMN public_code SET DEFAULT public.generate_job_post_public_code();

DO $$
DECLARE
  v_job_id UUID;
BEGIN
  FOR v_job_id IN
    SELECT id
    FROM public.job_posts
    WHERE public_code !~ '^[A-Za-z0-9_-]{5}$'
  LOOP
    UPDATE public.job_posts
    SET public_code = public.generate_job_post_public_code()
    WHERE id = v_job_id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_public_code_compact_format'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_public_code_compact_format
      CHECK (public_code ~ '^[A-Za-z0-9_-]{5}$') NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_public_code_compact_format;


-- =========================================================================
-- SOURCE FILE: 37_public_job_application_forms.sql
-- =========================================================================

-- Expose only the application form assigned to a posted public job.
-- The complete company-scoped global_settings record remains private.

CREATE OR REPLACE FUNCTION public.get_public_job_application_form(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  instructions TEXT,
  required_qualifications JSONB,
  custom_fields JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(form_config.form ->> 'instructions', '') AS instructions,
    CASE
      WHEN jsonb_typeof(form_config.form -> 'requiredQualifications') = 'array'
        THEN form_config.form -> 'requiredQualifications'
      ELSE '[]'::JSONB
    END AS required_qualifications,
    CASE
      WHEN jsonb_typeof(form_config.form -> 'customFields') = 'array'
        THEN form_config.form -> 'customFields'
      ELSE '[]'::JSONB
    END AS custom_fields
  FROM public.job_posts AS job
  LEFT JOIN public.global_settings AS settings
    ON settings.company_id = job.company_id
    AND settings.key = 'job_application_forms'
  CROSS JOIN LATERAL (
    SELECT COALESCE(settings.value -> job.id::TEXT, '{}'::JSONB) AS form
  ) AS form_config
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job_application_form(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_application_form(UUID, TEXT) TO anon, authenticated;


-- =========================================================================
-- SOURCE FILE: 38_job_post_salary_ranges.sql
-- =========================================================================

-- Optional monthly salary ranges for regular job posts.

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS salary_mode TEXT NOT NULL DEFAULT 'single';

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS monthly_salary_max NUMERIC(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_salary_mode_check'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_salary_mode_check
      CHECK (salary_mode IN ('single', 'range')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_monthly_salary_max_check'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_monthly_salary_max_check
      CHECK (
        monthly_salary_max IS NULL
        OR (
          monthly_salary_max >= 0
          AND (monthly_salary IS NULL OR monthly_salary_max >= monthly_salary)
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_salary_mode_check;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_monthly_salary_max_check;

CREATE OR REPLACE FUNCTION public.get_public_job_salary_range(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  salary_mode TEXT,
  monthly_salary_max NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.salary_mode,
    job.monthly_salary_max
  FROM public.job_posts AS job
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND job.status = 'posted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job_salary_range(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_salary_range(UUID, TEXT) TO anon, authenticated;


-- =========================================================================
-- SOURCE FILE: 39_job_applications.sql
-- =========================================================================

-- Persist public careers applications while keeping applicant data private to HR.

CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  job_public_code TEXT NOT NULL,
  job_title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  certified_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_post_id UUID REFERENCES public.job_posts(id) ON DELETE CASCADE;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_public_code TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_status_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_status_check
      CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_answers_array_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_answers_array_check
      CHECK (jsonb_typeof(answers) = 'array') NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_status_check;
ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_answers_array_check;

CREATE INDEX IF NOT EXISTS job_applications_company_job_submitted_idx
  ON public.job_applications (company_id, job_post_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS job_applications_company_status_idx
  ON public.job_applications (company_id, status);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-internal',
  'brightkey-internal',
  FALSE,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_applications'
      AND policyname = 'HR can read job applications'
  ) THEN
    CREATE POLICY "HR can read job applications"
      ON public.job_applications
      FOR SELECT
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'HR'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_applications'
      AND policyname = 'HR can update job applications'
  ) THEN
    CREATE POLICY "HR can update job applications"
      ON public.job_applications
      FOR UPDATE
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'HR'))
      WITH CHECK (public.has_module_access((SELECT auth.uid()), company_id, 'HR'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_job_application_summary(p_company_id UUID)
RETURNS TABLE (
  job_post_id UUID,
  job_public_code TEXT,
  job_title TEXT,
  total_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT,
  pending_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_module_access((SELECT auth.uid()), p_company_id, 'HR') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    job.id,
    job.public_code::TEXT,
    job.job_title::TEXT,
    COUNT(application.id),
    COUNT(application.id) FILTER (WHERE application.status = 'approved'),
    COUNT(application.id) FILTER (WHERE application.status = 'rejected'),
    COUNT(application.id) FILTER (WHERE application.status = 'pending')
  FROM public.job_posts AS job
  LEFT JOIN public.job_applications AS application
    ON application.company_id = job.company_id
    AND application.job_post_id = job.id
  WHERE job.company_id = p_company_id
  GROUP BY job.id, job.public_code, job.job_title, job.created_at
  ORDER BY job.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_application_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_application_summary(UUID) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 40_job_post_application_stages.sql
-- =========================================================================

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS application_stages JSONB NOT NULL
  DEFAULT '[{"name":"Stage 1","actions":["","",""]}]'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_posts_application_stages_length'
      AND conrelid = 'public.job_posts'::regclass
  ) THEN
    ALTER TABLE public.job_posts
      ADD CONSTRAINT job_posts_application_stages_length
      CHECK (
        jsonb_typeof(application_stages) = 'array'
        AND jsonb_array_length(application_stages) BETWEEN 1 AND 4
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.job_posts
  VALIDATE CONSTRAINT job_posts_application_stages_length;


-- =========================================================================
-- SOURCE FILE: 41_job_post_application_stage_defaults.sql
-- =========================================================================

ALTER TABLE public.job_posts
  ALTER COLUMN application_stages SET DEFAULT
  '[
    {"name":"Stage 1","actions":[""]},
    {"name":"Stage 2","actions":[""]},
    {"name":"Stage 3","actions":[""]}
  ]'::JSONB;


-- =========================================================================
-- SOURCE FILE: 42_backfill_legacy_application_stage_defaults.sql
-- =========================================================================

UPDATE public.job_posts
SET application_stages = '[
  {"name":"Stage 1","actions":[""]},
  {"name":"Stage 2","actions":[""]},
  {"name":"Stage 3","actions":[""]}
]'::JSONB
WHERE application_stages = '[
  {"name":"Stage 1","actions":["","",""]}
]'::JSONB;


-- =========================================================================
-- SOURCE FILE: 43_job_application_stage_progress.sql
-- =========================================================================

-- Track each applicant's progress through the job post's configured stages.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS current_stage INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS stage_history JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS hired_at TIMESTAMPTZ;

UPDATE public.job_applications
SET current_stage = 1
WHERE current_stage IS NULL;

UPDATE public.job_applications
SET stage_history = '[]'::JSONB
WHERE stage_history IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_current_stage_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_current_stage_check
      CHECK (current_stage BETWEEN 1 AND 4) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_applications_stage_history_array_check'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_stage_history_array_check
      CHECK (jsonb_typeof(stage_history) = 'array') NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_current_stage_check;

ALTER TABLE public.job_applications
  VALIDATE CONSTRAINT job_applications_stage_history_array_check;

CREATE INDEX IF NOT EXISTS job_applications_company_job_stage_submitted_idx
  ON public.job_applications (company_id, job_post_id, current_stage, submitted_at DESC);


-- =========================================================================
-- SOURCE FILE: 44_job_application_file_access.sql
-- =========================================================================

-- Allow signed-in HR users to generate short-lived links for application files.
-- Files remain private and company-scoped through their storage path.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'HR can read company job application files'
  ) THEN
    CREATE POLICY "HR can read company job application files"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'brightkey-internal'
        AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/job-applications/'
        AND public.has_module_access(
          (SELECT auth.uid()),
          ((storage.foldername(name))[2])::UUID,
          'HR'
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- SOURCE FILE: 45_leave_request_hierarchy_fallback.sql
-- =========================================================================

-- Resolve leave approvers through the organization structure when an employee
-- has no explicit reporting_to assignment. Direct assignments always win.

CREATE OR REPLACE FUNCTION public.resolve_employee_leave_manager(
  p_employee_id UUID,
  p_company_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_structure JSONB;
  v_department JSONB;
  v_team JSONB;
  v_department_manager UUID;
  v_team_manager UUID;
BEGIN
  SELECT employee.*
  INTO v_employee
  FROM public.employees employee
  WHERE employee.id = p_employee_id
    AND employee.company_id = p_company_id
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_employee.reporting_to IS NOT NULL THEN
    RETURN nullif(v_employee.reporting_to::TEXT, '')::UUID;
  END IF;

  SELECT setting.value
  INTO v_structure
  FROM public.global_settings setting
  WHERE setting.company_id = p_company_id
    AND setting.key = 'company_structure'
  LIMIT 1;

  FOR v_department IN
    SELECT value
    FROM jsonb_array_elements(coalesce(v_structure -> 'departments', '[]'::JSONB))
  LOOP
    v_department_manager := CASE
      WHEN nullif(v_department ->> 'managerId', '') IS NULL THEN NULL
      ELSE (v_department ->> 'managerId')::UUID
    END;

    FOR v_team IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_department -> 'subteams', '[]'::JSONB))
    LOOP
      v_team_manager := CASE
        WHEN nullif(v_team ->> 'managerId', '') IS NULL THEN NULL
        ELSE (v_team ->> 'managerId')::UUID
      END;

      IF v_team_manager = p_employee_id THEN
        RETURN v_department_manager;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(v_team -> 'colleagueIds', '[]'::JSONB)) colleague(employee_id)
        WHERE colleague.employee_id = p_employee_id::TEXT
      ) THEN
        RETURN coalesce(v_team_manager, v_department_manager);
      END IF;
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_employee_leave_manager(UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.decide_direct_report_leave_request(
  p_request_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  request_id UUID,
  request_status TEXT,
  vacation_leave_load NUMERIC,
  sick_leave_load NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manager public.employees%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_request public.leave_requests%ROWTYPE;
  v_decision TEXT := lower(trim(coalesce(p_decision, '')));
  v_days NUMERIC;
  v_effective_manager_id UUID;
BEGIN
  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid leave request decision';
  END IF;

  SELECT employee.*
  INTO v_manager
  FROM public.employees employee
  JOIN auth.users account
    ON lower(account.email) = lower(employee.email)
  WHERE account.id = auth.uid()
    AND lower(coalesce(employee.employment_status, '')) = 'active'
  LIMIT 1;

  IF v_manager.id IS NULL THEN
    RAISE EXCEPTION 'Active manager profile not found';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.leave_requests request
  WHERE request.id = p_request_id
    AND request.company_id = v_manager.company_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;

  IF lower(coalesce(v_request.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Leave request has already been decided';
  END IF;

  SELECT employee.*
  INTO v_employee
  FROM public.employees employee
  WHERE employee.id = v_request.employee_id
    AND employee.company_id = v_manager.company_id
  FOR UPDATE;

  v_effective_manager_id := public.resolve_employee_leave_manager(
    v_employee.id,
    v_manager.company_id
  );

  IF v_employee.id IS NULL OR v_effective_manager_id IS DISTINCT FROM v_manager.id THEN
    RAISE EXCEPTION 'Only the employee''s assigned leave manager can decide this request';
  END IF;

  v_days := greatest(coalesce(v_request.number_of_days, 0), 0);

  IF v_decision = 'approved' THEN
    IF lower(coalesce(v_request.leave_type, '')) = 'vacation' THEN
      IF coalesce(v_employee.vl_load, 0) < v_days THEN
        RAISE EXCEPTION 'Employee has insufficient vacation leave balance';
      END IF;

      UPDATE public.employees
      SET vl_load = coalesce(vl_load, 0) - v_days,
          updated_at = now()
      WHERE id = v_employee.id
        AND company_id = v_manager.company_id;
    ELSIF lower(coalesce(v_request.leave_type, '')) = 'sick' THEN
      IF coalesce(v_employee.sl_load, 0) < v_days THEN
        RAISE EXCEPTION 'Employee has insufficient sick leave balance';
      END IF;

      UPDATE public.employees
      SET sl_load = coalesce(sl_load, 0) - v_days,
          updated_at = now()
      WHERE id = v_employee.id
        AND company_id = v_manager.company_id;
    ELSE
      RAISE EXCEPTION 'Unsupported leave type';
    END IF;

    UPDATE public.leave_requests
    SET status = 'approved'
    WHERE id = v_request.id
      AND company_id = v_manager.company_id;
  ELSE
    IF nullif(trim(coalesce(p_rejection_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required';
    END IF;

    UPDATE public.leave_requests
    SET status = 'rejected',
        rejected_reason = trim(p_rejection_reason)
    WHERE id = v_request.id
      AND company_id = v_manager.company_id;
  END IF;

  RETURN QUERY
  SELECT
    v_request.id,
    v_decision,
    employee.vl_load,
    employee.sl_load
  FROM public.employees employee
  WHERE employee.id = v_employee.id
    AND employee.company_id = v_manager.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_direct_report_leave_request(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_direct_report_leave_request(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 48_company_holidays.sql
-- =========================================================================

-- Company-scoped yearly holiday calendars.
-- calendar_year remains populated when a holiday template is copied without dates.
CREATE TABLE IF NOT EXISTS public.company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL CHECK (
    holiday_type IN ('regular_holiday', 'special_non_working_holiday', 'company_break')
  ),
  calendar_year INTEGER NOT NULL CHECK (calendar_year BETWEEN 2000 AND 2200),
  inactive_from_year INTEGER CHECK (
    inactive_from_year IS NULL OR inactive_from_year >= calendar_year
  ),
  date_from DATE,
  date_to DATE,
  consistent_date_annually BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_holidays_date_order CHECK (
    date_to IS NULL OR (date_from IS NOT NULL AND date_to >= date_from)
  ),
  CONSTRAINT company_holidays_year_matches_dates CHECK (
    date_from IS NULL OR EXTRACT(YEAR FROM date_from)::INTEGER = calendar_year
  ),
  CONSTRAINT company_holidays_company_year_name_unique
    UNIQUE (company_id, calendar_year, holiday_name)
);

CREATE INDEX IF NOT EXISTS company_holidays_company_year_date_idx
  ON public.company_holidays (company_id, calendar_year, date_from);

CREATE INDEX IF NOT EXISTS company_holidays_company_effective_year_idx
  ON public.company_holidays (company_id, calendar_year, inactive_from_year);

CREATE OR REPLACE FUNCTION public.set_company_holidays_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_holidays_updated_at_trg ON public.company_holidays;
CREATE TRIGGER set_company_holidays_updated_at_trg
  BEFORE UPDATE ON public.company_holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_company_holidays_updated_at();

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_holidays'
      AND policyname = 'Allow company members read company holidays'
  ) THEN
    CREATE POLICY "Allow company members read company holidays"
      ON public.company_holidays
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_holidays'
      AND policyname = 'Allow company members write company holidays'
  ) THEN
    CREATE POLICY "Allow company members write company holidays"
      ON public.company_holidays
      FOR ALL
      TO authenticated
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_holidays TO authenticated;


-- =========================================================================
-- SOURCE FILE: 49_company_holiday_forward_inheritance.sql
-- =========================================================================

-- Holidays take effect in their creation year and remain active in future years.
-- Setting inactive_from_year preserves earlier historical calendars.
ALTER TABLE public.company_holidays
  ADD COLUMN IF NOT EXISTS inactive_from_year INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_holidays_inactive_year_valid'
      AND conrelid = 'public.company_holidays'::regclass
  ) THEN
    ALTER TABLE public.company_holidays
      ADD CONSTRAINT company_holidays_inactive_year_valid
      CHECK (inactive_from_year IS NULL OR inactive_from_year >= calendar_year);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS company_holidays_company_effective_year_idx
  ON public.company_holidays (company_id, calendar_year, inactive_from_year);


-- =========================================================================
-- SOURCE FILE: 50_company_holiday_consistent_dates.sql
-- =========================================================================

-- Fixed-date holidays keep the same month and day in succeeding years.
ALTER TABLE public.company_holidays
  ADD COLUMN IF NOT EXISTS consistent_date_annually BOOLEAN NOT NULL DEFAULT FALSE;


-- =========================================================================
-- SOURCE FILE: 53_hiring_directory_registration_tokens.sql
-- =========================================================================

-- One-time registration links issued with active hire emails.
CREATE TABLE IF NOT EXISTS public.hiring_directory_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS hiring_directory_registrations_token_idx
  ON public.hiring_directory_registrations (token_hash)
  WHERE used_at IS NULL;

ALTER TABLE public.hiring_directory_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hiring_directory_registrations FROM anon, authenticated;


-- =========================================================================
-- SOURCE FILE: 54_issue_hiring_directory_registration_rpc.sql
-- =========================================================================

-- Allow an authenticated HR user to issue a one-time registration token without
-- granting direct access to the private token table.
CREATE OR REPLACE FUNCTION public.issue_hiring_directory_registration(
  p_company_id UUID,
  p_application_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_modules JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid registration token hash' USING ERRCODE = '22023';
  END IF;

  IF p_expires_at <= NOW() OR p_expires_at > NOW() + INTERVAL '8 days' THEN
    RAISE EXCEPTION 'Invalid registration expiry' USING ERRCODE = '22023';
  END IF;

  SELECT c.tenant_id, lower(tm.role), to_jsonb(tm.accessible_modules)
    INTO v_tenant_id, v_role, v_modules
  FROM public.companies c
  JOIN public.tenant_members tm
    ON tm.tenant_id = c.tenant_id
   AND tm.user_id = auth.uid()
  WHERE c.id = p_company_id;

  IF v_tenant_id IS NULL OR NOT (
    v_role IN ('owner', 'admin', 'hr')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(v_modules, '[]'::jsonb)) module_name
      WHERE lower(trim(module_name)) = 'hr'
    )
  ) THEN
    RAISE EXCEPTION 'HR access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    WHERE ja.id = p_application_id
      AND ja.company_id = p_company_id
      AND ja.status = 'approved'
      AND ja.hired_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The hired application was not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.hiring_directory_registrations (
    company_id, application_id, token_hash, expires_at, used_at
  ) VALUES (
    p_company_id, p_application_id, p_token_hash, p_expires_at, NULL
  )
  ON CONFLICT (application_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    token_hash = EXCLUDED.token_hash,
    expires_at = EXCLUDED.expires_at,
    used_at = NULL,
    created_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.issue_hiring_directory_registration(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_hiring_directory_registration(UUID, UUID, TEXT, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_hiring_directory_registration(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 55_job_application_hire_email_sent_at.sql
-- =========================================================================

-- Persist successful hire-email delivery so the Hired-stage action can show its state.
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS hire_email_sent_at TIMESTAMPTZ;


-- =========================================================================
-- SOURCE FILE: 56_auto_close_fully_staffed_jobs.sql
-- =========================================================================

-- Close public job posts as soon as approved hires fill every vacancy.
CREATE OR REPLACE FUNCTION public.close_fully_staffed_job_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.hired_at IS NOT NULL THEN
    UPDATE public.job_posts job
    SET status = 'closed', updated_at = NOW()
    WHERE job.id = NEW.job_post_id
      AND job.company_id = NEW.company_id
      AND job.status = 'posted'
      AND (
        SELECT COUNT(*)
        FROM public.job_applications application
        WHERE application.job_post_id = job.id
          AND application.company_id = job.company_id
          AND application.status = 'approved'
          AND application.hired_at IS NOT NULL
      ) >= GREATEST(1, job.vacancy_count);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_fully_staffed_job_post_after_hire ON public.job_applications;
CREATE TRIGGER close_fully_staffed_job_post_after_hire
AFTER INSERT OR UPDATE OF status, hired_at ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.close_fully_staffed_job_post();

-- Prevent an edit from republishing a job whose vacancies are still full.
CREATE OR REPLACE FUNCTION public.enforce_job_post_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'posted' AND (
    SELECT COUNT(*)
    FROM public.job_applications application
    WHERE application.job_post_id = NEW.id
      AND application.company_id = NEW.company_id
      AND application.status = 'approved'
      AND application.hired_at IS NOT NULL
  ) >= GREATEST(1, NEW.vacancy_count) THEN
    NEW.status := 'closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_job_post_capacity_before_publish ON public.job_posts;
CREATE TRIGGER enforce_job_post_capacity_before_publish
BEFORE INSERT OR UPDATE OF vacancy_count, status ON public.job_posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_job_post_capacity();

-- Keep a filled direct link readable while public listings continue to show
-- only status = 'posted'. The returned shape remains backward-compatible.
CREATE OR REPLACE FUNCTION public.get_public_job_post(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS TABLE (
  public_code TEXT, employment_type TEXT, position_name TEXT, department_name TEXT,
  team_name TEXT, position_type TEXT, job_title TEXT, job_description TEXT,
  qualifications JSONB, responsibilities JSONB, milestones JSONB,
  project_length TEXT, fixed_price NUMERIC, monthly_salary NUMERIC,
  salary_confidential BOOLEAN, salary_negotiable BOOLEAN,
  compensation_extras TEXT[], benefits TEXT[], reporting_days TEXT[],
  reporting_time_start TIME, reporting_time_end TIME, free_hours BOOLEAN,
  reporting_mode TEXT, location_scope TEXT, location_country TEXT,
  location_city TEXT, applicant_type TEXT, expertise_level TEXT,
  vacancy_count INTEGER, expected_start_date DATE, tags TEXT[],
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.public_code, job.employment_type, job.position, job.department_name,
    job.team_name, job.position_type, job.job_title::TEXT,
    job.job_description::TEXT, job.qualifications, job.responsibilities,
    job.milestones, job.project_length, job.fixed_price, job.monthly_salary,
    job.salary_confidential, job.salary_negotiable, job.compensation_extras,
    job.benefits, job.reporting_days, job.reporting_time_start,
    job.reporting_time_end, job.free_hours, job.reporting_mode,
    job.location_scope, job.location_country, job.location_city,
    job.applicant_type, job.expertise_level, job.vacancy_count,
    job.expected_start_date, job.tags, job.created_at, job.updated_at
  FROM public.job_posts job
  WHERE job.company_id = p_company_id
    AND job.public_code = p_public_code
    AND (
      job.status = 'posted'
      OR (job.status = 'closed' AND (
        SELECT COUNT(*) FROM public.job_applications application
        WHERE application.job_post_id = job.id
          AND application.company_id = job.company_id
          AND application.status = 'approved'
          AND application.hired_at IS NOT NULL
      ) >= GREATEST(1, job.vacancy_count))
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_public_job_fully_staffed(
  p_company_id UUID,
  p_public_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_posts job
    WHERE job.company_id = p_company_id
      AND job.public_code = p_public_code
      AND job.status = 'closed'
      AND (
        SELECT COUNT(*) FROM public.job_applications application
        WHERE application.job_post_id = job.id
          AND application.company_id = job.company_id
          AND application.status = 'approved'
          AND application.hired_at IS NOT NULL
      ) >= GREATEST(1, job.vacancy_count)
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_job_fully_staffed(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_job_fully_staffed(UUID, TEXT) TO anon, authenticated;

UPDATE public.job_posts job
SET status = 'closed', updated_at = NOW()
WHERE job.status = 'posted'
  AND (
    SELECT COUNT(*)
    FROM public.job_applications application
    WHERE application.job_post_id = job.id
      AND application.company_id = job.company_id
      AND application.status = 'approved'
      AND application.hired_at IS NOT NULL
  ) >= GREATEST(1, job.vacancy_count);


-- =========================================================================
-- SOURCE FILE: 57_server_employee_number_generation.sql
-- =========================================================================

-- Generate collision-safe employee numbers explicitly for server-side onboarding.
CREATE SEQUENCE IF NOT EXISTS public.employee_counter_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.next_company_employee_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_prefix TEXT;
  candidate TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT upper(regexp_replace(COALESCE(value ->> 'employee_prefix', 'BK'), '[^A-Za-z0-9]', '', 'g'))
    INTO employee_prefix
  FROM public.global_settings
  WHERE company_id = p_company_id AND key = 'hr_configuration'
  LIMIT 1;
  employee_prefix := left(COALESCE(NULLIF(employee_prefix, ''), 'BK'), 8);

  LOOP
    candidate := employee_prefix || '-' || lpad(nextval('public.employee_counter_seq')::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.employees WHERE employee_number = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.next_company_employee_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_company_employee_number(UUID) TO service_role;


-- =========================================================================
-- SOURCE FILE: 58_company_employee_number_sequence.sql
-- =========================================================================

-- Continue each company's configured employee-number series during onboarding.
CREATE OR REPLACE FUNCTION public.next_company_employee_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_prefix TEXT;
  next_suffix BIGINT;
  candidate TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize number generation per company so concurrent registrations cannot
  -- calculate the same next suffix.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::TEXT, 0));

  SELECT upper(regexp_replace(COALESCE(value ->> 'employee_prefix', 'BK'), '[^A-Za-z0-9]', '', 'g'))
    INTO employee_prefix
  FROM public.global_settings
  WHERE company_id = p_company_id AND key = 'hr_config'
  LIMIT 1;
  employee_prefix := left(COALESCE(NULLIF(employee_prefix, ''), 'BK'), 3);

  SELECT COALESCE(MAX((regexp_match(employee_number, '^[A-Za-z0-9]+-([0-9]+)$'))[1]::BIGINT), 0) + 1
    INTO next_suffix
  FROM public.employees
  WHERE company_id = p_company_id
    AND employee_number ~ ('^' || employee_prefix || '-[0-9]+$');

  LOOP
    candidate := employee_prefix || '-' || lpad(next_suffix::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.employees WHERE employee_number = candidate
    );
    next_suffix := next_suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.next_company_employee_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_company_employee_number(UUID) TO service_role;


-- =========================================================================
-- SOURCE FILE: 59_prevent_duplicate_job_applications.sql
-- =========================================================================

-- Prevent new duplicate applications without deleting historical duplicates.
-- The advisory transaction lock serializes simultaneous submissions for the
-- same job and normalized email, closing the race left by an API-only check.

CREATE INDEX IF NOT EXISTS job_applications_job_normalized_email_idx
  ON public.job_applications (job_post_id, lower(btrim(email)));

CREATE OR REPLACE FUNCTION public.prevent_duplicate_job_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));

  PERFORM pg_advisory_xact_lock(
    hashtextextended(concat(CAST(NEW.job_post_id AS text), '|', NEW.email), 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.job_applications existing
    WHERE existing.job_post_id = NEW.job_post_id
      AND lower(btrim(existing.email)) = NEW.email
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'job_applications_one_email_per_job',
      MESSAGE = 'An application from this email already exists for this job.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_duplicate_job_application() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'prevent_duplicate_job_application_before_insert'
      AND tgrelid = 'public.job_applications'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER prevent_duplicate_job_application_before_insert
      BEFORE INSERT ON public.job_applications
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_duplicate_job_application();
  END IF;
END
$$;


-- =========================================================================
-- SOURCE FILE: 61_assign_job_post_tasks_on_account_activation.sql
-- =========================================================================

-- Copy a hired applicant's job-post responsibilities into Team when their
-- Employee Directory record becomes linked to a real Supabase Auth account.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hiring_application_id UUID;

ALTER TABLE public.team_tasks
  ADD COLUMN IF NOT EXISTS source_job_post_id UUID,
  ADD COLUMN IF NOT EXISTS source_responsibility_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_hiring_application_id_fkey'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_hiring_application_id_fkey
      FOREIGN KEY (hiring_application_id)
      REFERENCES public.job_applications(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_tasks_source_job_post_id_fkey'
      AND conrelid = 'public.team_tasks'::regclass
  ) THEN
    ALTER TABLE public.team_tasks
      ADD CONSTRAINT team_tasks_source_job_post_id_fkey
      FOREIGN KEY (source_job_post_id)
      REFERENCES public.job_posts(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS team_tasks_hiring_source_uidx
  ON public.team_tasks (assigned_to, source_job_post_id, source_responsibility_key)
  WHERE source_job_post_id IS NOT NULL
    AND source_responsibility_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_hiring_application_id_idx
  ON public.employees (hiring_application_id)
  WHERE hiring_application_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_hiring_responsibilities_to_employee(
  p_employee_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  employee_record public.employees%ROWTYPE;
  application_record public.job_applications%ROWTYPE;
  job_record public.job_posts%ROWTYPE;
  assigner_id UUID;
  inserted_count INTEGER := 0;
BEGIN
  SELECT * INTO employee_record
  FROM public.employees
  WHERE id = p_employee_id;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = employee_record.id
  ) THEN
    RETURN 0;
  END IF;

  IF employee_record.hiring_application_id IS NOT NULL THEN
    SELECT * INTO application_record
    FROM public.job_applications
    WHERE id = employee_record.hiring_application_id
      AND company_id = employee_record.company_id
      AND status = 'approved'
      AND hired_at IS NOT NULL;
  END IF;

  IF application_record.id IS NULL THEN
    SELECT application.* INTO application_record
    FROM public.job_applications application
    WHERE application.company_id = employee_record.company_id
      AND application.status = 'approved'
      AND application.hired_at IS NOT NULL
      AND (
        lower(btrim(application.email)) = lower(btrim(employee_record.email))
        OR (
          lower(regexp_replace(application.first_name, '\s+', '', 'g')) = lower(regexp_replace(employee_record.first_name, '\s+', '', 'g'))
          AND lower(regexp_replace(application.last_name, '\s+', '', 'g')) = lower(regexp_replace(employee_record.last_name, '\s+', '', 'g'))
        )
      )
    ORDER BY
      CASE WHEN lower(btrim(application.email)) = lower(btrim(employee_record.email)) THEN 0 ELSE 1 END,
      application.hired_at DESC,
      application.submitted_at DESC
    LIMIT 1;
  END IF;

  IF application_record.id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.employees
  SET hiring_application_id = application_record.id
  WHERE id = employee_record.id
    AND hiring_application_id IS DISTINCT FROM application_record.id;

  SELECT * INTO job_record
  FROM public.job_posts
  WHERE id = application_record.job_post_id
    AND company_id = employee_record.company_id;

  IF job_record.id IS NULL THEN
    RETURN 0;
  END IF;

  assigner_id := job_record.created_by;
  IF assigner_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = assigner_id) THEN
    SELECT member.user_id INTO assigner_id
    FROM public.companies company
    JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
    WHERE company.id = employee_record.company_id
      AND member.role IN ('owner', 'admin')
    ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF assigner_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH responsibility_rows AS (
    SELECT 'daily'::TEXT AS task_type, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'daily', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
    UNION ALL
    SELECT 'weekly'::TEXT, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'weekly', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
    UNION ALL
    SELECT 'monthly'::TEXT, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'monthly', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
  ), normalized_rows AS (
    SELECT
      task_type,
      ordinality,
      CASE
        WHEN jsonb_typeof(item) = 'object' THEN btrim(item->>'item')
        ELSE btrim(item #>> '{}')
      END AS title,
      CASE WHEN jsonb_typeof(item) = 'object' THEN NULLIF(btrim(item->>'kpi'), '') END AS kpi
    FROM responsibility_rows
  )
  INSERT INTO public.team_tasks (
    company_id,
    assigned_to,
    assigned_by,
    title,
    description,
    kpi,
    task_type,
    source_job_post_id,
    source_responsibility_key
  )
  SELECT
    employee_record.company_id,
    employee_record.id,
    assigner_id,
    title,
    NULL,
    kpi,
    task_type,
    job_record.id,
    concat(task_type, ':', ordinality)
  FROM normalized_rows
  WHERE title IS NOT NULL AND title <> ''
  ON CONFLICT (assigned_to, source_job_post_id, source_responsibility_key)
    WHERE source_job_post_id IS NOT NULL AND source_responsibility_key IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hiring_responsibilities_to_employee(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assign_hiring_responsibilities_after_employee_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assign_hiring_responsibilities_to_employee(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hiring_responsibilities_after_employee_link() FROM PUBLIC;

DROP TRIGGER IF EXISTS assign_hiring_responsibilities_after_employee_link ON public.employees;
CREATE TRIGGER assign_hiring_responsibilities_after_employee_link
  AFTER INSERT OR UPDATE OF id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_hiring_responsibilities_after_employee_link();

-- Backfill already-created accounts. The function is idempotent and inserts
-- only responsibilities that retain a unique job-post source key.
DO $$
DECLARE
  employee_id UUID;
BEGIN
  FOR employee_id IN
    SELECT employee.id
    FROM public.employees employee
    JOIN auth.users auth_user ON auth_user.id = employee.id
  LOOP
    PERFORM public.assign_hiring_responsibilities_to_employee(employee_id);
  END LOOP;
END
$$;


-- =========================================================================
-- SOURCE FILE: 65_employee_private_document_storage.sql
-- =========================================================================

-- Permit authenticated HR members to upload and read private employee
-- documents only within their own company-scoped employee folder.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'HR can upload company employee documents'
  ) THEN
    CREATE POLICY "HR can upload company employee documents"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'brightkey-internal'
        AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/employees/'
        AND public.has_module_access(
          (SELECT auth.uid()),
          ((storage.foldername(name))[2])::UUID,
          'HR'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'HR can read company employee documents'
  ) THEN
    CREATE POLICY "HR can read company employee documents"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'brightkey-internal'
        AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/employees/'
        AND public.has_module_access(
          (SELECT auth.uid()),
          ((storage.foldername(name))[2])::UUID,
          'HR'
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_employee_contract_signatures.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.employee_contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  signature_data_url TEXT NOT NULL CHECK (signature_data_url ~ '^data:image/png;base64,'),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_id, job_post_id)
);

ALTER TABLE public.employee_contract_signatures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_contract_signatures' AND policyname = 'Employees manage own contract signature') THEN
    CREATE POLICY "Employees manage own contract signature" ON public.employee_contract_signatures
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.employees employee WHERE employee.id = employee_contract_signatures.employee_id AND employee.company_id = employee_contract_signatures.company_id AND lower(employee.email) = lower(auth.jwt()->>'email'))
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.employees employee WHERE employee.id = employee_contract_signatures.employee_id AND employee.company_id = employee_contract_signatures.company_id AND lower(employee.email) = lower(auth.jwt()->>'email'))
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS employee_contract_signatures_company_employee_idx
  ON public.employee_contract_signatures (company_id, employee_id, job_post_id);


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_employee_job_post_assignment.sql
-- =========================================================================

-- Connect Employee Directory records directly to the job post that defines
-- their responsibilities, forms, and contract context.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS job_post_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_job_post_id_fkey'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_job_post_id_fkey
      FOREIGN KEY (job_post_id)
      REFERENCES public.job_posts(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS employees_company_job_post_idx
  ON public.employees (company_id, job_post_id)
  WHERE job_post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_employee_job_post_responsibilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job_record public.job_posts%ROWTYPE;
  assigner_id UUID;
BEGIN
  IF NEW.job_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.job_post_id IS NOT DISTINCT FROM OLD.job_post_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO job_record
  FROM public.job_posts
  WHERE id = NEW.job_post_id
    AND company_id = NEW.company_id;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION 'The selected job post does not belong to this employee company.';
  END IF;

  assigner_id := job_record.created_by;
  IF assigner_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = assigner_id) THEN
    SELECT member.user_id INTO assigner_id
    FROM public.companies company
    JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
    WHERE company.id = NEW.company_id
      AND member.role IN ('owner', 'admin')
    ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF assigner_id IS NULL THEN
    RETURN NEW;
  END IF;

  WITH responsibility_rows AS (
    SELECT 'daily'::TEXT AS task_type, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'daily', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
    UNION ALL
    SELECT 'weekly'::TEXT, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'weekly', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
    UNION ALL
    SELECT 'monthly'::TEXT, item, ordinality
    FROM jsonb_array_elements(COALESCE(job_record.responsibilities->'monthly', '[]'::JSONB))
      WITH ORDINALITY AS entries(item, ordinality)
  ), normalized_rows AS (
    SELECT
      task_type,
      ordinality,
      CASE WHEN jsonb_typeof(item) = 'object' THEN btrim(item->>'item') ELSE btrim(item #>> '{}') END AS title,
      CASE WHEN jsonb_typeof(item) = 'object' THEN NULLIF(btrim(item->>'kpi'), '') END AS kpi
    FROM responsibility_rows
  )
  INSERT INTO public.team_tasks (
    company_id, assigned_to, assigned_by, title, description, kpi,
    task_type, source_job_post_id, source_responsibility_key
  )
  SELECT
    NEW.company_id, NEW.id, assigner_id, title, NULL, kpi,
    task_type, job_record.id, concat(task_type, ':', ordinality)
  FROM normalized_rows
  WHERE title IS NOT NULL AND title <> ''
  ON CONFLICT (assigned_to, source_job_post_id, source_responsibility_key)
    WHERE source_job_post_id IS NOT NULL AND source_responsibility_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_job_post_responsibilities() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_employee_job_post_responsibilities ON public.employees;
CREATE TRIGGER sync_employee_job_post_responsibilities
  AFTER INSERT OR UPDATE OF job_post_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_job_post_responsibilities();


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_hr_invalidate_changed_contract_signatures.sql
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'HR can invalidate changed company contract signatures'
  ) THEN
    CREATE POLICY "HR can invalidate changed company contract signatures"
      ON public.employee_contract_signatures
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.companies company
          JOIN public.tenant_members member
            ON member.tenant_id = company.tenant_id
          WHERE company.id = employee_contract_signatures.company_id
            AND member.user_id = (SELECT auth.uid())
            AND (
              lower(coalesce(member.role, '')) IN ('owner', 'admin', 'tenant owner', 'hr')
              OR EXISTS (
                SELECT 1
                FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module_name
                WHERE lower(module_name) = 'hr'
              )
            )
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_hr_read_employee_contract_signatures.sql
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'HR can read company contract signatures'
  ) THEN
    CREATE POLICY "HR can read company contract signatures"
      ON public.employee_contract_signatures
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.companies company
          JOIN public.tenant_members member
            ON member.tenant_id = company.tenant_id
          WHERE company.id = employee_contract_signatures.company_id
            AND member.user_id = (SELECT auth.uid())
            AND (
              lower(coalesce(member.role, '')) IN ('owner', 'admin', 'tenant owner')
              OR EXISTS (
                SELECT 1
                FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module_name
                WHERE lower(module_name) = 'hr'
              )
            )
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_lock_signed_employee_contracts.sql
-- =========================================================================

DROP POLICY IF EXISTS "Employees manage own contract signature"
  ON public.employee_contract_signatures;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'Employees read own contract signature'
  ) THEN
    CREATE POLICY "Employees read own contract signature"
      ON public.employee_contract_signatures
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.employees employee
          WHERE employee.id = employee_contract_signatures.employee_id
            AND employee.company_id = employee_contract_signatures.company_id
            AND lower(employee.email) = lower(auth.jwt()->>'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'Employees sign own contract once'
  ) THEN
    CREATE POLICY "Employees sign own contract once"
      ON public.employee_contract_signatures
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.employees employee
          WHERE employee.id = employee_contract_signatures.employee_id
            AND employee.company_id = employee_contract_signatures.company_id
            AND lower(employee.email) = lower(auth.jwt()->>'email')
        )
      );
  END IF;
END
$$;
