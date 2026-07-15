-- =============================================================================
-- 16_add_event_attendees.sql
-- Create table for event attendee responses and enable public RLS policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_event_attendees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES public.company_events(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status           TEXT NOT NULL CHECK (status IN ('attending', 'not_attending', 'pending')) DEFAULT 'pending',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, employee_id)
);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION public.set_company_event_attendees_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_event_attendees_updated_at ON public.company_event_attendees;
CREATE TRIGGER trg_company_event_attendees_updated_at
  BEFORE UPDATE ON public.company_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_company_event_attendees_updated_at();

-- Enable Row Level Security
ALTER TABLE public.company_event_attendees ENABLE ROW LEVEL SECURITY;

-- Public access policies (Anyone with event_id & employee_id UUID can view/update responses via public email links)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_event_attendees' AND policyname = 'Allow public select attendees'
  ) THEN
    CREATE POLICY "Allow public select attendees" ON public.company_event_attendees
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_event_attendees' AND policyname = 'Allow public insert attendees'
  ) THEN
    CREATE POLICY "Allow public insert attendees" ON public.company_event_attendees
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_event_attendees' AND policyname = 'Allow public update attendees'
  ) THEN
    CREATE POLICY "Allow public update attendees" ON public.company_event_attendees
      FOR UPDATE USING (true);
  END IF;
END $$;
