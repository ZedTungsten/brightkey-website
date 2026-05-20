-- ============================================================
--  BrightKey — Employees Table v2 Migration
--  Adds: level, reporting_to, job_description, vl_load, sl_load
--  Run this in Supabase SQL Editor AFTER employees_schema.sql
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS level           TEXT,            -- e.g. Junior, Senior, Lead, Manager
  ADD COLUMN IF NOT EXISTS reporting_to    TEXT,            -- Employee name or employee_number
  ADD COLUMN IF NOT EXISTS job_description TEXT,            -- Full job description
  ADD COLUMN IF NOT EXISTS vl_load         NUMERIC(6,2) DEFAULT 0,  -- Vacation Leave credits
  ADD COLUMN IF NOT EXISTS sl_load         NUMERIC(6,2) DEFAULT 0;  -- Sick Leave credits
