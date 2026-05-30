-- Migration 13: Make all HR-assigned employee columns nullable (if they exist)
-- These fields are set later by HR in the employee directory.
-- The registration form only captures personal info and documents.

DO $$
DECLARE
  colname TEXT;
  cols TEXT[] := ARRAY[
    'department',
    'type',
    'position',
    'level',
    'reporting_to',
    'job_description',
    'employment_type',
    'date_hired',
    'date_regularized',
    'salary',
    'bank_name',
    'bank_account_number'
  ];
BEGIN
  FOREACH colname IN ARRAY cols
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'employees'
        AND column_name  = colname
        AND is_nullable  = 'NO'
    ) THEN
      EXECUTE format('ALTER TABLE public.employees ALTER COLUMN %I DROP NOT NULL', colname);
    END IF;
  END LOOP;
END $$;
