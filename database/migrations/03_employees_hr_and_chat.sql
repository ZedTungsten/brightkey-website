-- ==========================================
-- Source: 03_employees.sql
-- ==========================================

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


-- ==========================================
-- Source: 31_employee_adjustments_reimbursements.sql
-- ==========================================

-- =============================================================================
-- BrightKey Employee Adjustments & Reimbursements Tables
-- Consolidates adjustments and reimbursements with multi-tenant RLS.
-- =============================================================================

-- Drop tables if they exist
DROP TABLE IF EXISTS public.employee_adjustments CASCADE;
DROP TABLE IF EXISTS public.employee_reimbursements CASCADE;

-- Create employee_adjustments table
CREATE TABLE public.employee_adjustments (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  date           DATE NOT NULL,
  label          TEXT NOT NULL,
  client_id      TEXT,
  paid           BOOLEAN DEFAULT false NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Create employee_reimbursements table
CREATE TABLE public.employee_reimbursements (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  date           DATE NOT NULL,
  label          TEXT NOT NULL,
  client_id      TEXT,
  paid           BOOLEAN DEFAULT false NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_employee_adjustments_company ON public.employee_adjustments(company_id);
CREATE INDEX idx_employee_adjustments_employee ON public.employee_adjustments(employee_id);
CREATE INDEX idx_employee_reimbursements_company ON public.employee_reimbursements(company_id);
CREATE INDEX idx_employee_reimbursements_employee ON public.employee_reimbursements(employee_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.employee_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_reimbursements ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for employee_adjustments
CREATE POLICY "Allow company members read adjustments" ON public.employee_adjustments
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert adjustments" ON public.employee_adjustments
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update adjustments" ON public.employee_adjustments
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete adjustments" ON public.employee_adjustments
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Create RLS Policies for employee_reimbursements
CREATE POLICY "Allow company members read reimbursements" ON public.employee_reimbursements
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert reimbursements" ON public.employee_reimbursements
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update reimbursements" ON public.employee_reimbursements
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete reimbursements" ON public.employee_reimbursements
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );


-- ==========================================
-- Source: 32_payslip_records.sql
-- ==========================================

-- =============================================================================
-- BrightKey Payslip Records Table (32_payslip_records.sql)
-- Stores snapshots of employee department, position, salary, and earnings
-- when their payslips are finalized to prevent retrospective updates.
-- =============================================================================

DROP TABLE IF EXISTS public.payslip_records CASCADE;

CREATE TABLE public.payslip_records (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  payout_month        TEXT NOT NULL, -- Format: YYYY-MM
  
  -- Snapshotted Career/Payment Information
  department          TEXT,
  position            TEXT,
  salary              NUMERIC(12, 2) NOT NULL,
  
  -- Snapshotted Computed Payout Summary
  basic_paid          NUMERIC(12, 2) NOT NULL,
  commissions         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adjustments         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reimbursements      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  special_payouts     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_payout        NUMERIC(12, 2) NOT NULL,
  
  -- Detailed lists stored as JSONB for accurate historical breakdown rendering
  adjustments_list    JSONB DEFAULT '[]'::jsonb,
  reimbursements_list JSONB DEFAULT '[]'::jsonb,
  commission_details  JSONB DEFAULT '[]'::jsonb,
  special_schedules   JSONB DEFAULT '[]'::jsonb,
  
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_employee_month UNIQUE (employee_id, payout_month)
);

-- Indexing for performance
CREATE INDEX idx_payslip_records_company ON public.payslip_records(company_id);
CREATE INDEX idx_payslip_records_employee ON public.payslip_records(employee_id);
CREATE INDEX idx_payslip_records_employee_month ON public.payslip_records(employee_id, payout_month);

-- Enable Row Level Security (RLS)
ALTER TABLE public.payslip_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow company members read payslip records" ON public.payslip_records
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert payslip records" ON public.payslip_records
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update payslip records" ON public.payslip_records
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete payslip records" ON public.payslip_records
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );


-- ==========================================
-- Source: 35_attendance_logs_read_rls.sql
-- ==========================================

-- Drop the restrictive select policy on attendance_logs
DROP POLICY IF EXISTS "Employees can view their own attendance logs" ON public.attendance_logs;

-- Create a new select policy allowing company-wide selection for authenticated users in the same company
CREATE POLICY "Allow company members to view attendance logs" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );


-- ==========================================
-- Source: 38_enable_employee_chat_realtime.sql
-- ==========================================

-- Migration 38: Enable realtime delivery for employee chat and presence.
-- Supabase Realtime only streams tables added to the supabase_realtime publication.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'employee_chats'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_chats;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'attendance_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow members read company chats" ON public.employee_chats;
CREATE POLICY "Allow members read company chats" ON public.employee_chats
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = employee_chats.company_id
        AND e.id IN (employee_chats.sender_id, employee_chats.receiver_id)
        AND lower(e.email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "Allow members insert chats" ON public.employee_chats;
CREATE POLICY "Allow members insert chats" ON public.employee_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.company_id = employee_chats.company_id
        AND e.id = employee_chats.sender_id
        AND lower(e.email) = lower(auth.jwt() ->> 'email')
    )
  );


-- ==========================================
-- Source: 41_cascade_employee_id_updates.sql
-- ==========================================

-- Migration 41: Cascade Employee ID Updates
-- Drops existing foreign key constraints referencing public.employees(id) and recreates them with ON UPDATE CASCADE.
-- This prevents foreign key violations when register-employee.js updates an employee's ID to match their auth.users UUID.

-- 1. employee_adjustments
ALTER TABLE public.employee_adjustments 
  DROP CONSTRAINT IF EXISTS employee_adjustments_employee_id_fkey,
  ADD CONSTRAINT employee_adjustments_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. employee_reimbursements
ALTER TABLE public.employee_reimbursements 
  DROP CONSTRAINT IF EXISTS employee_reimbursements_employee_id_fkey,
  ADD CONSTRAINT employee_reimbursements_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. project_members
ALTER TABLE public.project_members 
  DROP CONSTRAINT IF EXISTS project_members_employee_id_fkey,
  ADD CONSTRAINT project_members_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. sales_schedules
ALTER TABLE public.sales_schedules 
  DROP CONSTRAINT IF EXISTS sales_schedules_employee_id_fkey,
  ADD CONSTRAINT sales_schedules_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. payslip_records
ALTER TABLE public.payslip_records 
  DROP CONSTRAINT IF EXISTS payslip_records_employee_id_fkey,
  ADD CONSTRAINT payslip_records_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. team_tasks
ALTER TABLE public.team_tasks 
  DROP CONSTRAINT IF EXISTS team_tasks_assigned_to_fkey,
  ADD CONSTRAINT team_tasks_assigned_to_fkey 
    FOREIGN KEY (assigned_to) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. team_milestones
ALTER TABLE public.team_milestones 
  DROP CONSTRAINT IF EXISTS team_milestones_assigned_to_fkey,
  ADD CONSTRAINT team_milestones_assigned_to_fkey 
    FOREIGN KEY (assigned_to) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. commission_assignments
ALTER TABLE public.commission_assignments 
  DROP CONSTRAINT IF EXISTS commission_assignments_employee_id_fkey,
  ADD CONSTRAINT commission_assignments_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. attendance_logs
ALTER TABLE public.attendance_logs 
  DROP CONSTRAINT IF EXISTS attendance_logs_employee_id_fkey,
  ADD CONSTRAINT attendance_logs_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. employee_update_requests
ALTER TABLE public.employee_update_requests 
  DROP CONSTRAINT IF EXISTS employee_update_requests_employee_id_fkey,
  ADD CONSTRAINT employee_update_requests_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 11. leave_requests
ALTER TABLE public.leave_requests 
  DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey,
  ADD CONSTRAINT leave_requests_employee_id_fkey 
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 12. employee_chats (sender_id)
ALTER TABLE public.employee_chats 
  DROP CONSTRAINT IF EXISTS employee_chats_sender_id_fkey,
  ADD CONSTRAINT employee_chats_sender_id_fkey 
    FOREIGN KEY (sender_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 13. employee_chats (receiver_id)
ALTER TABLE public.employee_chats 
  DROP CONSTRAINT IF EXISTS employee_chats_receiver_id_fkey,
  ADD CONSTRAINT employee_chats_receiver_id_fkey 
    FOREIGN KEY (receiver_id) REFERENCES public.employees(id) 
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ==========================================
-- Source: 42_chat_thread_summaries.sql
-- ==========================================

-- Migration 42: Indexed direct-message threads and server-maintained unread counts.

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  participant_one_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  participant_two_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  last_message_id UUID,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (participant_one_id <> participant_two_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_unique_pair
  ON public.chat_threads (company_id, participant_one_id, participant_two_id);

CREATE INDEX IF NOT EXISTS chat_threads_recent_idx
  ON public.chat_threads (company_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_thread_members (
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_read_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, employee_id)
);

CREATE INDEX IF NOT EXISTS chat_thread_members_employee_idx
  ON public.chat_thread_members (employee_id, thread_id);

ALTER TABLE public.employee_chats
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE;

INSERT INTO public.chat_threads (company_id, participant_one_id, participant_two_id)
SELECT DISTINCT
  company_id,
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id)
FROM public.employee_chats
ON CONFLICT (company_id, participant_one_id, participant_two_id) DO NOTHING;

UPDATE public.employee_chats message
SET thread_id = thread.id
FROM public.chat_threads thread
WHERE message.thread_id IS NULL
  AND thread.company_id = message.company_id
  AND thread.participant_one_id = LEAST(message.sender_id, message.receiver_id)
  AND thread.participant_two_id = GREATEST(message.sender_id, message.receiver_id);

INSERT INTO public.chat_thread_members (thread_id, employee_id)
SELECT id, participant_one_id FROM public.chat_threads
UNION
SELECT id, participant_two_id FROM public.chat_threads
ON CONFLICT (thread_id, employee_id) DO NOTHING;

WITH latest AS (
  SELECT DISTINCT ON (thread_id)
    thread_id,
    id,
    message,
    created_at
  FROM public.employee_chats
  WHERE thread_id IS NOT NULL
  ORDER BY thread_id, created_at DESC, id DESC
)
UPDATE public.chat_threads thread
SET last_message_id = latest.id,
    last_message_preview = left(latest.message, 160),
    last_message_at = latest.created_at
FROM latest
WHERE thread.id = latest.thread_id;

ALTER TABLE public.chat_threads
  DROP CONSTRAINT IF EXISTS chat_threads_last_message_id_fkey,
  ADD CONSTRAINT chat_threads_last_message_id_fkey
    FOREIGN KEY (last_message_id) REFERENCES public.employee_chats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employee_chats_thread_page_idx
  ON public.employee_chats (thread_id, created_at DESC, id DESC);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_thread_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read chat threads" ON public.chat_threads
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.company_id = chat_threads.company_id
        AND employee.id IN (chat_threads.participant_one_id, chat_threads.participant_two_id)
        AND lower(employee.email) = lower(auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Participants can read chat thread state" ON public.chat_thread_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      JOIN public.chat_threads thread ON thread.id = chat_thread_members.thread_id
      WHERE employee.id = chat_thread_members.employee_id
        AND employee.company_id = thread.company_id
        AND lower(employee.email) = lower(auth.jwt() ->> 'email')
    )
  );

CREATE OR REPLACE FUNCTION public.send_employee_chat(
  p_receiver_id UUID,
  p_message TEXT
)
RETURNS public.employee_chats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender public.employees%ROWTYPE;
  v_receiver public.employees%ROWTYPE;
  v_thread_id UUID;
  v_message public.employee_chats%ROWTYPE;
  v_first_id UUID;
  v_second_id UUID;
BEGIN
  IF auth.uid() IS NULL OR nullif(btrim(p_message), '') IS NULL THEN
    RAISE EXCEPTION 'A signed-in user and non-empty message are required';
  END IF;

  SELECT * INTO v_receiver
  FROM public.employees
  WHERE id = p_receiver_id;

  IF v_receiver.id IS NULL THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  SELECT * INTO v_sender
  FROM public.employees
  WHERE company_id = v_receiver.company_id
    AND lower(email) = lower(auth.jwt() ->> 'email')
  LIMIT 1;

  IF v_sender.id IS NULL OR v_sender.id = v_receiver.id THEN
    RAISE EXCEPTION 'Invalid chat participants';
  END IF;

  IF v_sender.company_id NOT IN (
    SELECT id FROM public.companies
    WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Chat company access denied';
  END IF;

  v_first_id := LEAST(v_sender.id, v_receiver.id);
  v_second_id := GREATEST(v_sender.id, v_receiver.id);

  INSERT INTO public.chat_threads (company_id, participant_one_id, participant_two_id)
  VALUES (v_sender.company_id, v_first_id, v_second_id)
  ON CONFLICT (company_id, participant_one_id, participant_two_id)
  DO UPDATE SET company_id = EXCLUDED.company_id
  RETURNING id INTO v_thread_id;

  INSERT INTO public.chat_thread_members (thread_id, employee_id)
  VALUES (v_thread_id, v_sender.id), (v_thread_id, v_receiver.id)
  ON CONFLICT (thread_id, employee_id) DO NOTHING;

  INSERT INTO public.employee_chats (thread_id, company_id, sender_id, receiver_id, message)
  VALUES (v_thread_id, v_sender.company_id, v_sender.id, v_receiver.id, btrim(p_message))
  RETURNING * INTO v_message;

  UPDATE public.chat_threads
  SET last_message_id = v_message.id,
      last_message_preview = left(v_message.message, 160),
      last_message_at = v_message.created_at
  WHERE id = v_thread_id;

  UPDATE public.chat_thread_members
  SET unread_count = unread_count + 1,
      updated_at = now()
  WHERE thread_id = v_thread_id
    AND employee_id = v_receiver.id;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_chat_thread_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  SELECT member.employee_id INTO v_employee_id
  FROM public.chat_thread_members member
  JOIN public.employees employee ON employee.id = member.employee_id
  WHERE member.thread_id = p_thread_id
    AND lower(employee.email) = lower(auth.jwt() ->> 'email')
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Chat thread access denied';
  END IF;

  UPDATE public.chat_thread_members
  SET unread_count = 0,
      last_read_at = now(),
      updated_at = now()
  WHERE thread_id = p_thread_id
    AND employee_id = v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_chat_inbox()
RETURNS TABLE (
  thread_id UUID,
  other_employee_id UUID,
  first_name TEXT,
  last_name TEXT,
  picture_link TEXT,
  status_text TEXT,
  unread_count INTEGER,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    thread.id,
    other_employee.id,
    other_employee.first_name::TEXT,
    other_employee.last_name::TEXT,
    other_employee.picture_link::TEXT,
    other_employee.status_text::TEXT,
    member.unread_count,
    thread.last_message_preview,
    thread.last_message_at
  FROM public.chat_thread_members member
  JOIN public.chat_threads thread ON thread.id = member.thread_id
  JOIN public.employees me ON me.id = member.employee_id
  JOIN public.employees other_employee
    ON other_employee.id = CASE
      WHEN thread.participant_one_id = member.employee_id THEN thread.participant_two_id
      ELSE thread.participant_one_id
    END
  WHERE lower(me.email) = lower(auth.jwt() ->> 'email')
    AND thread.company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  ORDER BY thread.last_message_at DESC NULLS LAST
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.send_employee_chat(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_chat_thread_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_employee_chat_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_employee_chat(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_thread_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_chat_inbox() TO authenticated;
GRANT SELECT ON public.chat_threads, public.chat_thread_members TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'chat_thread_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_thread_members;
    END IF;
  END IF;
END $$;


-- ==========================================
-- Source: 50_add_notes_to_employees.sql
-- ==========================================

-- Add notes column to employees for cross-device sticky notes syncing
ALTER TABLE public.employees ADD COLUMN notes TEXT;
