-- Add CRM-ready customer name fields without breaking existing customer_name consumers.
ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS customer_first_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_last_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_is_company BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_company_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_contact_person TEXT,
  ADD COLUMN IF NOT EXISTS customer_company_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'installation_bookings_company_type_check'
      AND conrelid = 'public.installation_bookings'::regclass
  ) THEN
    ALTER TABLE public.installation_bookings
      ADD CONSTRAINT installation_bookings_company_type_check
      CHECK (
        customer_company_type IS NULL
        OR customer_company_type IN (
          'education',
          'government',
          'healthcare',
          'hospitality',
          'manufacturing',
          'offices',
          'religious',
          'retail'
        )
      );
  END IF;
END $$;

-- Treat the final word as the last name and all preceding words as the first name.
UPDATE public.installation_bookings
SET
  customer_first_name = COALESCE(
    customer_first_name,
    NULLIF(
      REGEXP_REPLACE(BTRIM(customer_name), '[[:space:]]+[^[:space:]]+$', ''),
      BTRIM(customer_name)
    )
  ),
  customer_last_name = COALESCE(
    customer_last_name,
    SUBSTRING(BTRIM(customer_name) FROM '([^[:space:]]+)$')
  )
WHERE NULLIF(BTRIM(customer_name), '') IS NOT NULL
  AND (customer_first_name IS NULL OR customer_last_name IS NULL);
