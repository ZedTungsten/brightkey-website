-- =============================================================================
-- BrightKey Consolidated Employees Schema (02_employees_schema.sql)
-- Consolidates sequence, employees table, triggers, and RLS policies
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
  employee_number     TEXT UNIQUE NOT NULL,               -- e.g. BK-0001

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
  level               TEXT,            -- e.g. Junior, Senior, Lead, Manager
  reporting_to        TEXT,            -- Employee name or employee_number
  job_description     TEXT,            -- Full job description
  employment_type     TEXT,            -- Full-time, Part-time, Contract
  employment_status   TEXT DEFAULT 'Active', -- Active, Inactive, Resigned, Terminated
  date_hired          DATE,
  date_regularized    DATE,
  salary              NUMERIC(12, 2),
  bank_name           TEXT,
  bank_account_number TEXT,
  
  -- Leave credits
  vl_load             NUMERIC(6,2) DEFAULT 0,  -- Vacation Leave credits
  sl_load             NUMERIC(6,2) DEFAULT 0,  -- Sick Leave credits
  
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

CREATE TRIGGER trg_employees_updated_at
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

-- RLS policies
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert"
  ON public.employees FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated read"
  ON public.employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete" 
  ON public.employees FOR DELETE 
  USING (true);
