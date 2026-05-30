-- Migration 13: Make all HR-assigned employee columns nullable
-- These fields are set later by HR in the employee directory.
-- The registration form only captures personal info and documents.

ALTER TABLE public.employees
  ALTER COLUMN department            DROP NOT NULL,
  ALTER COLUMN type                  DROP NOT NULL,
  ALTER COLUMN position              DROP NOT NULL,
  ALTER COLUMN level                 DROP NOT NULL,
  ALTER COLUMN reporting_to          DROP NOT NULL,
  ALTER COLUMN job_description       DROP NOT NULL,
  ALTER COLUMN employment_type       DROP NOT NULL,
  ALTER COLUMN date_hired            DROP NOT NULL,
  ALTER COLUMN date_regularized      DROP NOT NULL,
  ALTER COLUMN salary                DROP NOT NULL,
  ALTER COLUMN bank_name             DROP NOT NULL,
  ALTER COLUMN bank_account_number   DROP NOT NULL;

-- Also ensure columns the live table may still have as NOT NULL are covered
-- (live table uses 'type' instead of 'employment_type' — cover both)
DO $$
BEGIN
  -- Drop NOT NULL on 'type' if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'employees'
      AND column_name  = 'type'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.employees ALTER COLUMN type DROP NOT NULL;
  END IF;

  -- Drop NOT NULL on 'department' if it exists (may already be done above)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'employees'
      AND column_name  = 'department'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.employees ALTER COLUMN department DROP NOT NULL;
  END IF;
END $$;
