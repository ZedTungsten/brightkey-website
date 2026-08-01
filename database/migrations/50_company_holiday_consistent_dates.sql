-- Fixed-date holidays keep the same month and day in succeeding years.
ALTER TABLE public.company_holidays
  ADD COLUMN IF NOT EXISTS consistent_date_annually BOOLEAN NOT NULL DEFAULT FALSE;
