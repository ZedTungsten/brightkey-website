-- =============================================================================
-- BrightKey Consolidated Operations Migration (04_operations_bookings_and_tasks.sql)
-- Consolidates installation bookings, schedules, commissions locking, support tickets,
-- projects, team tasks, team milestones, QA guides, and related triggers.
-- All operations are safe and non-destructive.
-- =============================================================================

-- ── 1. Installation Bookings Table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.installation_bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  folder_ref_id       TEXT NOT NULL,
  order_no            TEXT NOT NULL,
  customer_name       TEXT NOT NULL,
  customer_first_name TEXT,
  customer_last_name  TEXT,
  customer_is_company BOOLEAN DEFAULT FALSE,
  customer_company_name TEXT,
  customer_contact_person TEXT,
  customer_company_type TEXT,
  customer_social     TEXT,
  customer_email      TEXT,
  customer_phone      TEXT,
  customer_address    TEXT,
  scheduled_date      DATE,
  scheduled_time      TEXT,
  installer_id        TEXT,
  installer_name      TEXT,
  products            JSONB DEFAULT '[]'::JSONB,
  doors               JSONB DEFAULT '[]'::JSONB,
  map_image_url       TEXT,
  frontage_image_url  TEXT,
  receipt_pdf_url     TEXT,
  work_permit_image_url TEXT,
  
  -- Stored in centavos (integers)
  subtotal            INTEGER,
  charges             INTEGER DEFAULT 0,
  deductions          INTEGER DEFAULT 0,
  grand_total         INTEGER,
  deposit_amount      INTEGER,
  balance_due         INTEGER,
  
  status              TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'
  )),
  commissions_locked  BOOLEAN DEFAULT FALSE,
  product_skus        TEXT,
  product_names       TEXT,
  product_qtys        TEXT,
  product_unit_prices TEXT,
  product_totals      TEXT,
  charge_labels       TEXT,
  charge_values       TEXT,
  deduction_labels    TEXT,
  deduction_values    TEXT,
  door_photo_urls     TEXT,
  google_map_pin_url  TEXT,
  notes               TEXT,
  installers          JSONB DEFAULT '[]'::JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS commissions_locked BOOLEAN DEFAULT FALSE;

-- ── 2. Support Tickets & Messages Tables ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  ticket_number       TEXT NOT NULL,
  subject             TEXT NOT NULL,
  category            TEXT NOT NULL,
  priority            TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status              TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  customer_name       TEXT,
  customer_email      TEXT,
  assigned_to         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE NOT NULL,
  sender_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message             TEXT NOT NULL,
  attachments         TEXT[] DEFAULT '{}',
  is_internal         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Projects, Tasks, and Milestones Tables ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  status              TEXT DEFAULT 'active' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  leader_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date          DATE,
  end_date            DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  assignee_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority            TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status              TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  due_date            DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_milestones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  due_date            DATE,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qa_guides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  category            TEXT,
  content             TEXT NOT NULL,
  checklist_items     JSONB DEFAULT '[]'::JSONB,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Functions & Triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_installation_bookings_updated_at ON public.installation_bookings;
CREATE TRIGGER set_installation_bookings_updated_at
  BEFORE UPDATE ON public.installation_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();

CREATE OR REPLACE FUNCTION update_team_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_tasks_updated_at ON public.team_tasks;
CREATE TRIGGER trg_team_tasks_updated_at
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW EXECUTE FUNCTION update_team_tasks_updated_at();

CREATE OR REPLACE FUNCTION update_team_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_milestones_updated_at ON public.team_milestones;
CREATE TRIGGER trg_team_milestones_updated_at
  BEFORE UPDATE ON public.team_milestones
  FOR EACH ROW EXECUTE FUNCTION update_team_milestones_updated_at();

CREATE OR REPLACE FUNCTION update_qa_guides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qa_guides_updated_at ON public.qa_guides;
CREATE TRIGGER trg_qa_guides_updated_at
  BEFORE UPDATE ON public.qa_guides
  FOR EACH ROW EXECUTE FUNCTION update_qa_guides_updated_at();

CREATE OR REPLACE FUNCTION public.is_team_leader(
  p_user_id    UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_structure JSONB;
  v_is_leader BOOLEAN := FALSE;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.companies WHERE id = p_company_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN FALSE; END IF;

  SELECT role INTO v_role
  FROM public.tenant_members
  WHERE user_id = p_user_id AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_role IS NOT NULL AND lower(v_role) IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  SELECT value INTO v_structure
  FROM public.global_settings
  WHERE key = 'company_structure' AND company_id = p_company_id
  LIMIT 1;

  IF v_structure IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_structure->'departments') AS dept(managerId TEXT)
    WHERE dept.managerId = p_user_id::TEXT
  ) INTO v_is_leader;

  RETURN COALESCE(v_is_leader, FALSE);
END;
$$;
