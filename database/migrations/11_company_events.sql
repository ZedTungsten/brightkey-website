-- =============================================================================
-- 11_company_events.sql
-- Company Events table for the HR Events dashboard page.
-- Visibility level: INTEGER 1–4 (1 = all staff can see, 4 = only level 4 can see)
-- =============================================================================

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  title            TEXT NOT NULL,
  description      TEXT,
  visibility_level INTEGER NOT NULL DEFAULT 1 CHECK (visibility_level BETWEEN 1 AND 10),

  is_date_range    BOOLEAN NOT NULL DEFAULT FALSE,
  is_whole_day     BOOLEAN NOT NULL DEFAULT FALSE,
  date_from        DATE NOT NULL,
  date_to          DATE,          -- NULL when is_date_range = FALSE

  time_start       TEXT,          -- HH:MM (24h), optional
  time_end         TEXT,          -- HH:MM (24h), optional

  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_company_events_company_id ON public.company_events(company_id);
CREATE INDEX IF NOT EXISTS idx_company_events_date_from  ON public.company_events(date_from);

-- ── 3. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_company_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_events_updated_at ON public.company_events;
CREATE TRIGGER trg_company_events_updated_at
  BEFORE UPDATE ON public.company_events
  FOR EACH ROW EXECUTE FUNCTION public.set_company_events_updated_at();

-- ── 4. Enable Row Level Security ──────────────────────────────────────────────
ALTER TABLE public.company_events ENABLE ROW LEVEL SECURITY;

-- ── 5. RLS Policies ───────────────────────────────────────────────────────────

-- Members of the company can read events at or above their visibility level
-- (event level 1 = everyone sees it; event level 4 = only level 4+ staff see it)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_events' AND policyname = 'Allow company members read events'
  ) THEN
    CREATE POLICY "Allow company members read events" ON public.company_events
      FOR SELECT USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Only HR / Admin / Owner can insert events
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_events' AND policyname = 'Allow HR insert events'
  ) THEN
    CREATE POLICY "Allow HR insert events" ON public.company_events
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Only HR / Admin / Owner can update their company's events
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_events' AND policyname = 'Allow HR update events'
  ) THEN
    CREATE POLICY "Allow HR update events" ON public.company_events
      FOR UPDATE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Only HR / Admin / Owner can delete their company's events
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_events' AND policyname = 'Allow HR delete events'
  ) THEN
    CREATE POLICY "Allow HR delete events" ON public.company_events
      FOR DELETE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
