-- ============================================================
--  BrightKey — Employees Table Migration
--  Run this in Supabase SQL Editor
-- ============================================================

-- Sequence for auto-incrementing employee counter
CREATE SEQUENCE IF NOT EXISTS employee_counter_seq START 1;

-- Main employees table
CREATE TABLE IF NOT EXISTS employees (
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

  -- HR / Admin Fields (filled later via dashboard)
  department          TEXT,
  position            TEXT,
  employment_type     TEXT,          -- Full-time, Part-time, Contract
  employment_status   TEXT DEFAULT 'Active',   -- Active, Inactive, Resigned, Terminated
  date_hired          DATE,
  date_regularized    DATE,
  salary              NUMERIC(12, 2),
  bank_name           TEXT,
  bank_account_number TEXT,
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

DROP TRIGGER IF EXISTS employees_updated_at ON employees;
CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();

-- RLS: Allow anon inserts (public form) and authenticated reads/updates
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT (employee self-registration form)
CREATE POLICY "Allow public insert"
  ON employees FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only authenticated users (HR/Admin) can SELECT and UPDATE
CREATE POLICY "Allow authenticated read"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update"
  ON employees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

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
