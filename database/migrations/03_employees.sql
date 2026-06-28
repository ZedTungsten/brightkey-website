-- =============================================================================
-- BrightKey Consolidated Employees Schema (03_employees.sql)
-- Consolidates employees, attendance, update requests, leaves, chats tables,
-- 12-hour expiry presence view, and multi-tenant self-access/HR RLS policies.
-- =============================================================================

DROP VIEW IF EXISTS public.employee_presence CASCADE;
DROP TABLE IF EXISTS public.employee_chats CASCADE;
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.employee_update_requests CASCADE;
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP SEQUENCE IF EXISTS employee_counter_seq;

-- Sequence for auto-incrementing employee counter
CREATE SEQUENCE employee_counter_seq START 1;

-- Main employees table
CREATE TABLE public.employees (
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

  -- HR / Admin Fields (Nullable)
  department          TEXT,
  position            TEXT,
  level               TEXT,
  reporting_to        TEXT,
  job_description     TEXT,
  employment_type     TEXT,
  employment_status   TEXT DEFAULT 'Active',
  date_hired          DATE,
  date_regularized    DATE,
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

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();

-- Function to generate next employee number (BK-0001 format)
CREATE OR REPLACE FUNCTION generate_employee_number()
RETURNS TEXT AS $$
DECLARE
  next_val INT;
BEGIN
  next_val := nextval('employee_counter_seq');
  RETURN 'BK-' || LPAD(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── Attendance Logs Table ───────────────────────────────────────────────────
CREATE TABLE public.attendance_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  status       VARCHAR(20) NOT NULL CHECK (status IN ('available', 'break', 'offline')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Employee Update Requests Table ───────────────────────────────────────────
CREATE TABLE public.employee_update_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
    tenant_id UUID NOT NULL,
    requested_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejected_reason VARCHAR(150) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Leave Requests Table ─────────────────────────────────────────────────────
CREATE TABLE public.leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id      UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  leave_type       VARCHAR(20) NOT NULL CHECK (leave_type IN ('sick', 'vacation')),
  date_from        DATE NOT NULL,
  date_to          DATE NOT NULL,
  number_of_days   NUMERIC(4, 1) NOT NULL,
  reason           TEXT NOT NULL,
  status           VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejected_reason  TEXT DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── Employee Chats Table ─────────────────────────────────────────────────────
CREATE TABLE public.employee_chats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sender_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  receiver_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Employee Presence View (with 12-Hour Expiry) ─────────────────────────────
CREATE OR REPLACE VIEW public.employee_presence
WITH (security_invoker = true) AS
SELECT DISTINCT ON (employee_id)
  employee_id,
  CASE
    WHEN created_at < now() - INTERVAL '12 hours' THEN 'offline'::character varying(20)
    ELSE status
  END::character varying(20) as status,
  created_at
FROM public.attendance_logs
ORDER BY employee_id, created_at DESC;

-- ── Row Level Security Policies ──────────────────────────────────────────────

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_chats ENABLE ROW LEVEL SECURITY;

-- 1. Employees Policies
CREATE POLICY "Employees can view their own profile" ON public.employees
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Employees can update their own profile details" ON public.employees
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "HR module employees" ON public.employees
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'HR'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'HR'));

-- 2. Attendance Logs Policies
CREATE POLICY "Employees can view their own attendance logs" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

CREATE POLICY "Employees can insert their own attendance logs" ON public.attendance_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "HR module attendance_logs" ON public.attendance_logs
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'HR'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'HR'));

-- 3. Employee Update Requests Policies
CREATE POLICY "Users can view their own update requests" ON public.employee_update_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

CREATE POLICY "Users can submit their own update requests" ON public.employee_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "HR module employee_update_requests read" ON public.employee_update_requests
  FOR SELECT TO authenticated
  USING (
    auth.uid() = employee_id
    OR public.has_module_access(
      auth.uid(),
      (SELECT id FROM public.companies WHERE tenant_id = employee_update_requests.tenant_id LIMIT 1),
      'HR'
    )
  );

CREATE POLICY "HR module employee_update_requests manage" ON public.employee_update_requests
  FOR ALL TO authenticated
  USING (
    public.has_module_access(
      auth.uid(),
      (SELECT id FROM public.companies WHERE tenant_id = employee_update_requests.tenant_id LIMIT 1),
      'HR'
    )
  )
  WITH CHECK (
    public.has_module_access(
      auth.uid(),
      (SELECT id FROM public.companies WHERE tenant_id = employee_update_requests.tenant_id LIMIT 1),
      'HR'
    )
  );

-- 4. Leave Requests Policies
CREATE POLICY "Users can view their own leave requests" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

CREATE POLICY "Users can submit their own leave requests" ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Company-scoped leaves access" ON public.leave_requests
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- 5. Chats Policies
CREATE POLICY "Allow members read company chats" ON public.employee_chats
  FOR SELECT TO authenticated
  USING (
    (sender_id = auth.uid() OR receiver_id = auth.uid())
    AND company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

CREATE POLICY "Allow members insert chats" ON public.employee_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );
