-- =============================================================================
-- BrightKey Consolidated Employees Schema (03_employees.sql)
-- Consolidates sequence, employees table (with company_id and nullable HR fields),
-- triggers, and company-scoped RLS policies.
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop elements if they exist
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

-- ── Row Level Security Policies ──────────────────────────────────────────────

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Company-scoped: only tenant members can read/write employees of their company
CREATE POLICY "Company staff employees access" ON public.employees
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );
