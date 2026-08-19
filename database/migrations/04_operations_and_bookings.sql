-- Consolidated Database Migration: 04_operations_and_bookings.sql
-- Generated on 2026-08-06T15:24:48.292Z


-- =========================================================================
-- SOURCE FILE: 04_operations_bookings_and_tasks.sql
-- =========================================================================

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


-- =========================================================================
-- SOURCE FILE: 10_secure_installer_and_inventory_access.sql
-- =========================================================================

-- =============================================================================
-- Remove anonymous access to employee PII and inventory operations.
-- The installer portal keeps its existing PIN format, but validation now occurs
-- inside Postgres and returns only the fields the portal needs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.authenticate_installer(p_password TEXT)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.id,
    employee.first_name,
    employee.last_name,
    employee.contact_number,
    employee.company_id,
    employee.assignment,
    employee.email,
    employee.department,
    employee.title,
    employee.employment_status
  FROM public.employees employee
  WHERE employee.employment_status = 'Active'
    AND 'installer' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
    AND lower(trim(p_password)) =
      lower(
        left(trim(coalesce(employee.first_name, '')), 1)
        || left(trim(coalesce(employee.last_name, '')), 1)
        || right(
          regexp_replace(
            coalesce(employee.emergency_contact_number, ''),
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.authenticate_installer(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_installer(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Public read employees." ON public.employees;

DROP POLICY IF EXISTS "Allow public select" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public insert" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public update" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public delete" ON public.inventory_transactions;


-- =========================================================================
-- SOURCE FILE: 11_secure_installer_booking_sessions.sql
-- =========================================================================

-- =============================================================================
-- Replace anonymous installation-booking table access with short-lived,
-- installer-scoped RPC sessions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.installer_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installer_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_installer_sessions_expiry
  ON public.installer_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees employee
  WHERE employee.employment_status = 'Active'
    AND 'installer' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
    AND lower(trim(p_password)) =
      lower(
        left(trim(coalesce(employee.first_name, '')), 1)
        || left(trim(coalesce(employee.last_name, '')), 1)
        || right(
          regexp_replace(
            coalesce(employee.emergency_contact_number, ''),
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      )
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.installer_sessions
  WHERE expires_at <= now()
     OR employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name,
    matched_employee.last_name,
    matched_employee.contact_number,
    matched_employee.company_id,
    matched_employee.assignment,
    matched_employee.email,
    matched_employee.department,
    matched_employee.title,
    matched_employee.employment_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.installer_can_access_booking(
  p_token UUID,
  p_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.installer_sessions session
    JOIN public.installation_bookings booking
      ON booking.id = p_booking_id
     AND booking.company_id = session.company_id
    WHERE session.token = p_token
      AND session.expires_at > now()
      AND (
        session.employee_id::text = ANY (
          string_to_array(coalesce(booking.installer_id, ''), ' | ')
        )
        OR coalesce(booking.installers, '[]'::jsonb) @>
          jsonb_build_array(
            jsonb_build_object('id', session.employee_id::text)
          )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            coalesce(booking.doors, '[]'::jsonb)
          ) door
          CROSS JOIN LATERAL jsonb_array_elements(
            coalesce(door -> 'installers', '[]'::jsonb)
          ) door_installer
          WHERE door_installer ->> 'id' = session.employee_id::text
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_installer_bookings(p_token UUID)
RETURNS SETOF public.installation_bookings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT booking.*
  FROM public.installation_bookings booking
  JOIN public.installer_sessions session
    ON session.company_id = booking.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND booking.status <> 'cancelled'
    AND public.installer_can_access_booking(p_token, booking.id)
  ORDER BY booking.scheduled_date, booking.scheduled_time
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.get_installer_delivery_statuses(p_token UUID)
RETURNS TABLE (reference_id TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT delivery.reference_id, delivery.status
  FROM public.delivery_bookings delivery
  JOIN public.installer_sessions session
    ON session.company_id = delivery.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.installation_bookings booking
      WHERE booking.company_id = session.company_id
        AND booking.order_no = delivery.reference_id
        AND public.installer_can_access_booking(p_token, booking.id)
    )
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.get_installer_booking_doors(
  p_token UUID,
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT booking.doors
  FROM public.installation_bookings booking
  WHERE booking.id = p_booking_id
    AND public.installer_can_access_booking(p_token, booking.id);
$$;

CREATE OR REPLACE FUNCTION public.update_installer_booking(
  p_token UUID,
  p_booking_id UUID,
  p_changes JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_keys CONSTANT TEXT[] := ARRAY[
    'doors', 'status', 'products', 'product_skus', 'product_names',
    'product_qtys', 'product_unit_prices', 'product_totals',
    'subtotal', 'grand_total', 'balance_due'
  ];
  supplied_key TEXT;
BEGIN
  IF NOT public.installer_can_access_booking(p_token, p_booking_id) THEN
    RETURN FALSE;
  END IF;

  FOR supplied_key IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT supplied_key = ANY (allowed_keys) THEN
      RAISE EXCEPTION 'Unsupported installer booking field';
    END IF;
  END LOOP;

  UPDATE public.installation_bookings booking
  SET
    doors = CASE
      WHEN p_changes ? 'doors' THEN p_changes -> 'doors'
      ELSE booking.doors
    END,
    status = CASE
      WHEN p_changes ? 'status' THEN p_changes ->> 'status'
      ELSE booking.status
    END,
    products = CASE
      WHEN p_changes ? 'products' THEN p_changes -> 'products'
      ELSE booking.products
    END,
    product_skus = CASE
      WHEN p_changes ? 'product_skus' THEN p_changes ->> 'product_skus'
      ELSE booking.product_skus
    END,
    product_names = CASE
      WHEN p_changes ? 'product_names' THEN p_changes ->> 'product_names'
      ELSE booking.product_names
    END,
    product_qtys = CASE
      WHEN p_changes ? 'product_qtys' THEN p_changes ->> 'product_qtys'
      ELSE booking.product_qtys
    END,
    product_unit_prices = CASE
      WHEN p_changes ? 'product_unit_prices'
        THEN p_changes ->> 'product_unit_prices'
      ELSE booking.product_unit_prices
    END,
    product_totals = CASE
      WHEN p_changes ? 'product_totals' THEN p_changes ->> 'product_totals'
      ELSE booking.product_totals
    END,
    subtotal = CASE
      WHEN p_changes ? 'subtotal' THEN (p_changes ->> 'subtotal')::INTEGER
      ELSE booking.subtotal
    END,
    grand_total = CASE
      WHEN p_changes ? 'grand_total'
        THEN (p_changes ->> 'grand_total')::INTEGER
      ELSE booking.grand_total
    END,
    balance_due = CASE
      WHEN p_changes ? 'balance_due'
        THEN (p_changes ->> 'balance_due')::INTEGER
      ELSE booking.balance_due
    END,
    updated_at = now()
  WHERE booking.id = p_booking_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.installer_can_access_booking(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installer_bookings(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installer_delivery_statuses(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installer_booking_doors(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_installer_booking(UUID, UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_installer_bookings(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_installer_delivery_statuses(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_installer_booking_doors(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.update_installer_booking(UUID, UUID, JSONB) TO anon;

-- Session issuance supersedes the legacy password lookup. Retain the function
-- for rollback compatibility, but prevent clients from calling it directly.
REVOKE ALL ON FUNCTION public.authenticate_installer(TEXT)
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Allow public insert installation_bookings"
  ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public read installation_bookings"
  ON public.installation_bookings;
DROP POLICY IF EXISTS "Allow public update installation_bookings"
  ON public.installation_bookings;


-- =========================================================================
-- SOURCE FILE: 12_fix_installer_session_return_types.sql
-- =========================================================================

-- =============================================================================
-- Match the installer-session RPC's declared TEXT fields to live employee
-- columns that use VARCHAR. PostgreSQL does not implicitly coerce function
-- result columns when validating a RETURN QUERY row shape.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees employee
  WHERE employee.employment_status = 'Active'
    AND 'installer' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
    AND lower(trim(p_password)) =
      lower(
        left(trim(coalesce(employee.first_name, '')), 1)
        || left(trim(coalesce(employee.last_name, '')), 1)
        || right(
          regexp_replace(
            coalesce(employee.emergency_contact_number, ''),
            '[^0-9]',
            '',
            'g'
          ),
          4
        )
      )
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.installer_sessions
  WHERE expires_at <= now()
     OR employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name::TEXT,
    matched_employee.last_name::TEXT,
    matched_employee.contact_number::TEXT,
    matched_employee.company_id,
    matched_employee.assignment::TEXT,
    matched_employee.email::TEXT,
    matched_employee.department::TEXT,
    matched_employee.title::TEXT,
    matched_employee.employment_status::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;


-- =========================================================================
-- SOURCE FILE: 13_add_installer_payout_profile.sql
-- =========================================================================

-- =============================================================================
-- Expose the authenticated installer's payroll calculation inputs without
-- restoring anonymous access to the employees table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_installer_payout_profile(p_token UUID)
RETURNS TABLE (
  salary NUMERIC,
  date_hired DATE,
  shift_days TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.salary,
    employee.date_hired,
    employee.shift_days::TEXT
  FROM public.installer_sessions session
  JOIN public.employees employee
    ON employee.id = session.employee_id
   AND employee.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_installer_payout_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_payout_profile(UUID) TO anon;


-- =========================================================================
-- SOURCE FILE: 24_company_installer_directory.sql
-- =========================================================================

-- =============================================================================
-- Tenant-safe installer directory for booking assignment controls.
-- Returns only fields needed by the booking UI without exposing full HR records.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_company_installer_directory(
  p_company_id UUID
)
RETURNS TABLE (
  id UUID,
  employee_number TEXT,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  department TEXT,
  assignment TEXT,
  city TEXT,
  picture_link TEXT,
  employment_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.id,
    employee.employee_number,
    employee.first_name,
    employee.last_name,
    employee.title,
    employee.department,
    employee.assignment,
    employee.city,
    employee.picture_link,
    employee.employment_status
  FROM public.employees employee
  WHERE employee.company_id = p_company_id
    AND EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member
        ON member.tenant_id = company.tenant_id
      WHERE company.id = p_company_id
        AND member.user_id = (SELECT auth.uid())
    )
  ORDER BY employee.first_name, employee.last_name, employee.id;
$$;

REVOKE ALL ON FUNCTION public.get_company_installer_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_installer_directory(UUID) TO authenticated;


-- =========================================================================
-- SOURCE FILE: 25_revoke_inactive_installer_sessions.sql
-- =========================================================================

-- =============================================================================
-- Revoke SmartLock Calendar access as soon as an employee is no longer active.
-- New logins are already restricted to employment_status = 'Active'.
-- =============================================================================

DELETE FROM public.installer_sessions session
USING public.employees employee
WHERE employee.id = session.employee_id
  AND lower(trim(coalesce(employee.employment_status, ''))) <> 'active';

CREATE OR REPLACE FUNCTION public.revoke_inactive_installer_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(trim(coalesce(NEW.employment_status, ''))) <> 'active' THEN
    DELETE FROM public.installer_sessions
    WHERE employee_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'revoke_inactive_installer_sessions'
      AND tgrelid = 'public.employees'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER revoke_inactive_installer_sessions
    AFTER UPDATE OF employment_status ON public.employees
    FOR EACH ROW
    WHEN (OLD.employment_status IS DISTINCT FROM NEW.employment_status)
    EXECUTE FUNCTION public.revoke_inactive_installer_sessions();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_installer_payout_profile(p_token UUID)
RETURNS TABLE (
  salary NUMERIC,
  date_hired DATE,
  shift_days TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    employee.salary,
    employee.date_hired,
    employee.shift_days::TEXT
  FROM public.installer_sessions session
  JOIN public.employees employee
    ON employee.id = session.employee_id
   AND employee.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND lower(trim(coalesce(employee.employment_status, ''))) = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_installer_payout_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_payout_profile(UUID) TO anon;


-- =========================================================================
-- SOURCE FILE: 46_add_booking_pickup_schedule.sql
-- =========================================================================

-- Optional delivery/pickup schedule attached to an installation order.
-- Nullable by design so existing and installation-only bookings remain valid.
ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS pickup_time TEXT,
  ADD COLUMN IF NOT EXISTS pickup_notes TEXT;

COMMENT ON COLUMN public.installation_bookings.pickup_date
  IS 'Optional customer pickup or installer delivery date.';
COMMENT ON COLUMN public.installation_bookings.pickup_time
  IS 'Optional preferred pickup/delivery time window (Morning or Afternoon).';
COMMENT ON COLUMN public.installation_bookings.pickup_notes
  IS 'Optional customer pickup or installer delivery instructions.';


-- =========================================================================
-- SOURCE FILE: 60_add_booking_secondary_contact.sql
-- =========================================================================

-- Preserve the existing customer_phone field as Contact Number 1 and add an
-- optional second number for booking and calendar workflows.

ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS customer_phone_2 TEXT;

ALTER TABLE public.installation_bookings
  DROP CONSTRAINT IF EXISTS installation_bookings_customer_phone_2_digits;

ALTER TABLE public.installation_bookings
  ADD CONSTRAINT installation_bookings_customer_phone_2_digits
    CHECK (customer_phone_2 IS NULL OR customer_phone_2 ~ '^[0-9]+$') NOT VALID;


-- =========================================================================
-- SOURCE FILE: 63_installer_accounts.sql
-- =========================================================================

-- =============================================================================
-- Tenant-scoped SmartLock Calendar installer access codes and login tracking.
-- These access codes are separate from Supabase dashboard user passwords.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.installer_accounts (
  employee_id UUID PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  password VARCHAR(10) NOT NULL CHECK (char_length(password) BETWEEN 4 AND 10),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id)
);

ALTER TABLE public.installer_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_installer_accounts_company
  ON public.installer_accounts (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_installer_accounts_company_password
  ON public.installer_accounts (company_id, lower(password));

DROP POLICY IF EXISTS "Operations members can view installer accounts" ON public.installer_accounts;
CREATE POLICY "Operations members can view installer accounts"
  ON public.installer_accounts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
      WHERE company.id = installer_accounts.company_id
        AND member.user_id = (SELECT auth.uid())
        AND (
          lower(coalesce(member.role, '')) IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module
            WHERE split_part(lower(trim(module)), ':', 1) = 'operations'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Operations members can manage installer accounts" ON public.installer_accounts;
CREATE POLICY "Operations members can manage installer accounts"
  ON public.installer_accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
      WHERE company.id = installer_accounts.company_id
        AND member.user_id = (SELECT auth.uid())
        AND (
          lower(coalesce(member.role, '')) IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module
            WHERE split_part(lower(trim(module)), ':', 1) = 'operations'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.companies company
      JOIN public.tenant_members member ON member.tenant_id = company.tenant_id
      WHERE company.id = installer_accounts.company_id
        AND member.user_id = (SELECT auth.uid())
        AND (
          lower(coalesce(member.role, '')) IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module
            WHERE split_part(lower(trim(module)), ':', 1) = 'operations'
          )
        )
    )
  );

INSERT INTO public.installer_accounts (employee_id, company_id, password)
SELECT
  employee.id,
  employee.company_id,
  left(
    lower(
      left(trim(coalesce(employee.first_name, '')), 1)
      || left(trim(coalesce(employee.last_name, '')), 1)
      || right(
        coalesce(
          nullif(regexp_replace(coalesce(employee.emergency_contact_number, ''), '[^0-9]', '', 'g'), ''),
          nullif(regexp_replace(coalesce(employee.employee_number, ''), '[^0-9]', '', 'g'), ''),
          '0000'
        ),
        4
      )
    ),
    10
  )
FROM public.employees employee
WHERE employee.company_id IS NOT NULL
  AND (
    lower(coalesce(employee.assignment, '')) ~ '(^|,\s*)installers?(\s*,|$)'
    OR lower(coalesce(employee.title, '')) LIKE '%installer%'
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees employee
  JOIN public.installer_accounts account
    ON account.employee_id = employee.id
   AND account.company_id = employee.company_id
  WHERE lower(coalesce(employee.employment_status, '')) = 'active'
    AND (
      lower(coalesce(employee.assignment, '')) ~ '(^|,\s*)installers?(\s*,|$)'
      OR lower(coalesce(employee.title, '')) LIKE '%installer%'
    )
    AND lower(trim(account.password)) = lower(trim(p_password))
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.installer_accounts
  SET last_login_at = now(), updated_at = now()
  WHERE employee_id = matched_employee.id
    AND company_id = matched_employee.company_id;

  DELETE FROM public.installer_sessions
  WHERE expires_at <= now()
     OR employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name::TEXT,
    matched_employee.last_name::TEXT,
    matched_employee.contact_number::TEXT,
    matched_employee.company_id,
    matched_employee.assignment::TEXT,
    matched_employee.email::TEXT,
    matched_employee.department::TEXT,
    matched_employee.title::TEXT,
    matched_employee.employment_status::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;


-- =========================================================================
-- SOURCE FILE: 64_fix_installer_session_company_reference.sql
-- =========================================================================

-- Qualify installer account columns that collide with RETURNS TABLE output
-- variables (notably company_id) inside the installer login RPC.
CREATE OR REPLACE FUNCTION public.create_installer_session(p_password TEXT)
RETURNS TABLE (
  session_token UUID,
  id UUID,
  first_name TEXT,
  last_name TEXT,
  contact_number TEXT,
  company_id UUID,
  assignment TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  employment_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_employee public.employees%ROWTYPE;
  new_token UUID;
BEGIN
  SELECT employee.*
  INTO matched_employee
  FROM public.employees AS employee
  JOIN public.installer_accounts AS account
    ON account.employee_id = employee.id
   AND account.company_id = employee.company_id
  WHERE lower(coalesce(employee.employment_status, '')) = 'active'
    AND (
      lower(coalesce(employee.assignment, '')) ~ '(^|,\s*)installers?(\s*,|$)'
      OR lower(coalesce(employee.title, '')) LIKE '%installer%'
    )
    AND lower(trim(account.password)) = lower(trim(p_password))
  LIMIT 1;

  IF matched_employee.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.installer_accounts AS account
  SET last_login_at = now(),
      updated_at = now()
  WHERE account.employee_id = matched_employee.id
    AND account.company_id = matched_employee.company_id;

  DELETE FROM public.installer_sessions AS session
  WHERE session.expires_at <= now()
     OR session.employee_id = matched_employee.id;

  INSERT INTO public.installer_sessions (employee_id, company_id)
  VALUES (matched_employee.id, matched_employee.company_id)
  RETURNING token INTO new_token;

  RETURN QUERY SELECT
    new_token,
    matched_employee.id,
    matched_employee.first_name::TEXT,
    matched_employee.last_name::TEXT,
    matched_employee.contact_number::TEXT,
    matched_employee.company_id,
    matched_employee.assignment::TEXT,
    matched_employee.email::TEXT,
    matched_employee.department::TEXT,
    matched_employee.title::TEXT,
    matched_employee.employment_status::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installer_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installer_session(TEXT) TO anon;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260809_installer_notes.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.installer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  content_html TEXT NOT NULL CHECK (char_length(content_html) BETWEEN 1 AND 100000),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installer_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_installer_notes_company_updated
  ON public.installer_notes (company_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can read installer notes'
  ) THEN
    CREATE POLICY "Company members can read installer notes" ON public.installer_notes
      FOR SELECT USING (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can create installer notes'
  ) THEN
    CREATE POLICY "Company members can create installer notes" ON public.installer_notes
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
        AND created_by = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can update installer notes'
  ) THEN
    CREATE POLICY "Company members can update installer notes" ON public.installer_notes
      FOR UPDATE USING (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      ) WITH CHECK (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'installer_notes' AND policyname = 'Company members can delete installer notes'
  ) THEN
    CREATE POLICY "Company members can delete installer notes" ON public.installer_notes
      FOR DELETE USING (
        company_id IN (
          SELECT company.id
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
      );
  END IF;
END
$$;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260809_installer_notes_portal_access.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_installer_notes(p_token UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content_html TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT note.id, note.title, note.content_html, note.updated_at
  FROM public.installer_sessions AS session
  JOIN public.installer_notes AS note
    ON note.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
  ORDER BY note.updated_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_installer_notes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_notes(UUID) TO anon;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260813_logistics_calendar_warehouse_leaves.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_warehouse_staff_approved_leaves(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  date_from DATE,
  date_to DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies company
    JOIN public.tenant_members member
      ON member.tenant_id = company.tenant_id
    WHERE company.id = p_company_id
      AND member.user_id = auth.uid()
      AND (
        lower(coalesce(member.role, '')) IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) access
          WHERE lower(trim(access)) = 'logistics'
             OR lower(trim(access)) LIKE 'logistics:%'
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    employee.id,
    trim(concat_ws(' ', employee.first_name, employee.last_name)),
    request.date_from,
    request.date_to
  FROM public.leave_requests request
  JOIN public.employees employee
    ON employee.id = request.employee_id
   AND employee.company_id = request.company_id
  WHERE request.company_id = p_company_id
    AND lower(request.status) = 'approved'
    AND request.date_from <= p_end_date
    AND request.date_to >= p_start_date
    AND 'warehouse staff' = ANY (
      regexp_split_to_array(lower(coalesce(employee.assignment, '')), '\s*,\s*')
    )
  ORDER BY request.date_from, employee.first_name, employee.last_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_staff_approved_leaves(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_warehouse_staff_approved_leaves(UUID, DATE, DATE) TO authenticated;


-- =========================================================================
-- CONSOLIDATED SOURCE: 20260814_installer_service_catalog.sql
-- =========================================================================

-- Expose only the tenant's Service-category SKU labels to a valid installer
-- session. This keeps product classification authoritative without granting the
-- anonymous installer portal direct access to the full product catalog.
CREATE OR REPLACE FUNCTION public.get_installer_service_catalog(p_token UUID)
RETURNS TABLE (
  sku TEXT,
  title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    product.sku::TEXT,
    product.title::TEXT
  FROM public.installer_sessions AS session
  JOIN public.products AS product
    ON product.company_id = session.company_id
  WHERE session.token = p_token
    AND session.expires_at > now()
    AND lower(trim(product.category)) = 'service'
    AND product.sku IS NOT NULL
    AND trim(product.sku) <> ''
  ORDER BY product.sku
  LIMIT 250;
$$;

REVOKE ALL ON FUNCTION public.get_installer_service_catalog(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_installer_service_catalog(UUID) TO anon;
