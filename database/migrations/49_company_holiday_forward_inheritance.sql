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
