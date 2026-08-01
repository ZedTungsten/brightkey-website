-- Company-scoped yearly holiday calendars.
-- calendar_year remains populated when a holiday template is copied without dates.
CREATE TABLE IF NOT EXISTS public.company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL CHECK (
    holiday_type IN ('regular_holiday', 'special_non_working_holiday', 'company_break')
  ),
  calendar_year INTEGER NOT NULL CHECK (calendar_year BETWEEN 2000 AND 2200),
  inactive_from_year INTEGER CHECK (
    inactive_from_year IS NULL OR inactive_from_year >= calendar_year
  ),
  date_from DATE,
  date_to DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_holidays_date_order CHECK (
    date_to IS NULL OR (date_from IS NOT NULL AND date_to >= date_from)
  ),
  CONSTRAINT company_holidays_year_matches_dates CHECK (
    date_from IS NULL OR EXTRACT(YEAR FROM date_from)::INTEGER = calendar_year
  ),
  CONSTRAINT company_holidays_company_year_name_unique
    UNIQUE (company_id, calendar_year, holiday_name)
);

CREATE INDEX IF NOT EXISTS company_holidays_company_year_date_idx
  ON public.company_holidays (company_id, calendar_year, date_from);

CREATE INDEX IF NOT EXISTS company_holidays_company_effective_year_idx
  ON public.company_holidays (company_id, calendar_year, inactive_from_year);

CREATE OR REPLACE FUNCTION public.set_company_holidays_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_holidays_updated_at_trg ON public.company_holidays;
CREATE TRIGGER set_company_holidays_updated_at_trg
  BEFORE UPDATE ON public.company_holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_company_holidays_updated_at();

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_holidays'
      AND policyname = 'Allow company members read company holidays'
  ) THEN
    CREATE POLICY "Allow company members read company holidays"
      ON public.company_holidays
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_holidays'
      AND policyname = 'Allow company members write company holidays'
  ) THEN
    CREATE POLICY "Allow company members write company holidays"
      ON public.company_holidays
      FOR ALL
      TO authenticated
      USING (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT c.id
          FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_holidays TO authenticated;
