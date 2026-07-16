-- =============================================================================
-- 22_add_recurring_source_id_to_company_events.sql
-- Add recurring_source_id column and unique constraint to prevent duplicate archived instances.
-- =============================================================================

ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS recurring_source_id UUID REFERENCES public.company_events(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_recurring_archive'
  ) THEN
    ALTER TABLE public.company_events ADD CONSTRAINT unique_recurring_archive UNIQUE (recurring_source_id, date_from);
  END IF;
END $$;
