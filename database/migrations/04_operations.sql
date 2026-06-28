-- =============================================================================
-- BrightKey Consolidated Operations Schema (04_operations.sql)
-- Consolidates inventory, inventory logs, inventory transactions,
-- installations, support tickets & messages, team tasks/milestones,
-- and per-user module RLS policies.
-- =============================================================================

DROP TABLE IF EXISTS public.team_tasks CASCADE;
DROP TABLE IF EXISTS public.team_milestones CASCADE;
DROP TABLE IF EXISTS public.support_messages CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.installation_bookings CASCADE;
DROP TABLE IF EXISTS public.installations CASCADE;
DROP TABLE IF EXISTS public.inventory_transactions CASCADE;
DROP TABLE IF EXISTS public.inventory_logs CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TYPE IF EXISTS public.inventory_event_type;

-- ── 1. Inventory Table ───────────────────────────────────────────────────────
CREATE TABLE public.inventory (
  product_id          UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  available           INTEGER DEFAULT 0 NOT NULL,
  incoming            INTEGER DEFAULT 0 NOT NULL,
  returned            INTEGER DEFAULT 0 NOT NULL,
  reserved            INTEGER DEFAULT 0 NOT NULL,
  inspect             INTEGER DEFAULT 0 NOT NULL,
  packed              INTEGER DEFAULT 0 NOT NULL,
  dispatched          INTEGER DEFAULT 0 NOT NULL,
  cancelled           INTEGER DEFAULT 0 NOT NULL,
  ordered_past_month  INTEGER DEFAULT 0 NOT NULL,
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Inventory Logs Table (Ledger event type and logs) ─────────────────────
CREATE TYPE public.inventory_event_type AS ENUM (
  'supplier_ordered', 
  'received',         
  'order_reserved',  
  'packed',           
  'dispatch',         
  'return',           
  'cancellation'      
);

CREATE TABLE public.inventory_logs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  event_type          public.inventory_event_type NOT NULL,
  quantity_change     INTEGER NOT NULL,
  reference_id        UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to automate Inventory summarization from logs
CREATE OR REPLACE FUNCTION public.process_inventory_log_entry()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.inventory (product_id, company_id, available, incoming, reserved, dispatched, returned)
  VALUES (NEW.product_id, NEW.company_id, 0, 0, 0, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;

  CASE NEW.event_type
    WHEN 'supplier_ordered' THEN
      UPDATE public.inventory SET incoming = incoming + NEW.quantity_change, last_updated = NOW() WHERE product_id = NEW.product_id;
    WHEN 'received' THEN
      UPDATE public.inventory SET incoming = incoming - NEW.quantity_change, available = available + NEW.quantity_change, last_updated = NOW() WHERE product_id = NEW.product_id;
    WHEN 'order_reserved' THEN
      UPDATE public.inventory SET available = available - NEW.quantity_change, reserved = reserved + NEW.quantity_change, last_updated = NOW() WHERE product_id = NEW.product_id;
    WHEN 'dispatch' THEN
      UPDATE public.inventory SET reserved = reserved - NEW.quantity_change, dispatched = dispatched + NEW.quantity_change, last_updated = NOW() WHERE product_id = NEW.product_id;
    WHEN 'cancellation' THEN
      UPDATE public.inventory SET reserved = reserved - NEW.quantity_change, available = available + NEW.quantity_change, last_updated = NOW() WHERE product_id = NEW.product_id;
    WHEN 'return' THEN
      UPDATE public.inventory SET available = available + NEW.quantity_change, dispatched = dispatched - NEW.quantity_change, returned = returned + NEW.quantity_change, last_updated = NOW() WHERE product_id = NEW.product_id;
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_process_inventory_log
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.process_inventory_log_entry();

-- ── 3. Inventory Transactions Table (State transitions) ──────────────────────
CREATE TABLE public.inventory_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  sku                   TEXT NOT NULL,
  quantity              INTEGER NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('supplier_order', 'customer_order')),
  status                TEXT NOT NULL CONSTRAINT inventory_transactions_status_check CHECK (status IN ('ordered', 'received', 'inspect', 'reserved', 'packed', 'dispatched', 'returned', 'cancelled')),
  reference_id          TEXT,
  customer_name         TEXT,
  customer_city         TEXT,
  packed_photo_url      TEXT,
  
  timestamp_ordered     TIMESTAMPTZ,
  timestamp_received    TIMESTAMPTZ,
  timestamp_inspect     TIMESTAMPTZ,
  timestamp_reserved    TIMESTAMPTZ,
  timestamp_packed      TIMESTAMPTZ,
  timestamp_dispatched  TIMESTAMPTZ,
  timestamp_returned    TIMESTAMPTZ,
  timestamp_cancelled   TIMESTAMPTZ,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at trigger for transactions
CREATE OR REPLACE FUNCTION update_inventory_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_inventory_transactions_updated_at
  BEFORE UPDATE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION update_inventory_transactions_updated_at();

CREATE INDEX IF NOT EXISTS idx_inv_tx_sku          ON public.inventory_transactions(sku);
CREATE INDEX IF NOT EXISTS idx_inv_tx_status       ON public.inventory_transactions(status);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref_id       ON public.inventory_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created_at   ON public.inventory_transactions(created_at DESC);

-- ── 4. Installations Table ───────────────────────────────────────────────────
CREATE TABLE public.installations (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  order_id            UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  door_material       TEXT,
  door_picture_url    TEXT,
  map_link            TEXT,
  scheduled_date      DATE,
  installer_notes     TEXT,
  proof_picture_urls  JSONB DEFAULT '[]'::JSONB,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'completed')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Installation Bookings Table ───────────────────────────────────────────
CREATE TABLE public.installation_bookings (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  folder_ref_id       TEXT NOT NULL,
  order_no            TEXT NOT NULL,
  customer_name       TEXT NOT NULL,
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

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_installation_bookings_updated_at
  BEFORE UPDATE ON public.installation_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_installation_bookings_folder_ref ON public.installation_bookings (folder_ref_id);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_date ON public.installation_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_status ON public.installation_bookings (status);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_created ON public.installation_bookings (created_at DESC);

-- ── 6. Support Tickets Table ─────────────────────────────────────────────────
CREATE TABLE public.support_tickets (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  subject             TEXT NOT NULL,
  status              TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at for support_tickets
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();

-- ── 7. Support Messages Table ────────────────────────────────────────────────
CREATE TABLE public.support_messages (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id           UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin')),
  sender_id           UUID,
  message             TEXT NOT NULL,
  attachment_urls     JSONB DEFAULT '[]'::JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Team Tasks Table ──────────────────────────────────────────────────────
CREATE TABLE public.team_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  assigned_by  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  description  VARCHAR(500),
  kpi          TEXT,
  task_type    TEXT NOT NULL CHECK (task_type IN ('daily', 'weekly', 'monthly')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. Team Milestones Table ─────────────────────────────────────────────────
CREATE TABLE public.team_milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  assigned_by  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  description  VARCHAR(500),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  deadline     DATE DEFAULT NULL,
  parent_id    UUID REFERENCES public.team_milestones(id) ON DELETE CASCADE,
  is_group     BOOLEAN NOT NULL DEFAULT FALSE,
  position     INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_team_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_team_tasks_updated_at
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW EXECUTE FUNCTION update_team_tasks_updated_at();

CREATE OR REPLACE FUNCTION update_team_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_team_milestones_updated_at
  BEFORE UPDATE ON public.team_milestones
  FOR EACH ROW EXECUTE FUNCTION update_team_milestones_updated_at();

-- ── Row Level Security Policies ──────────────────────────────────────────────

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_milestones ENABLE ROW LEVEL SECURITY;

-- 1. Operations module installations policies
CREATE POLICY "Operations module installations" ON public.installations
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

-- 2. Operations module installation bookings policies
CREATE POLICY "Operations module installation_bookings" ON public.installation_bookings
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

-- 3. Operations OR Logistics module inventory policies
CREATE POLICY "Operations or Logistics module inventory" ON public.inventory
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  );

-- 4. Operations OR Logistics module inventory logs policies
CREATE POLICY "Operations or Logistics module inventory_logs" ON public.inventory_logs
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  );

-- 5. Operations OR Logistics module inventory transactions policies
CREATE POLICY "Operations or Logistics module inventory_transactions" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Operations')
    OR public.has_module_access(auth.uid(), company_id, 'Logistics')
  );

-- 6. Operations module team tasks policies
CREATE POLICY "Operations module team_tasks" ON public.team_tasks
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

-- 7. Operations module team milestones policies
CREATE POLICY "Operations module team_milestones" ON public.team_milestones
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Operations'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Operations'));

-- 8. Support tickets policies (CS module or Operations or customer self-access)
CREATE POLICY "Customers can view own tickets." ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Customers can insert own tickets." ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Customer Service module support_tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (
    public.has_module_access(auth.uid(), company_id, 'Customer Service')
    OR public.has_module_access(auth.uid(), company_id, 'Operations')
  )
  WITH CHECK (
    public.has_module_access(auth.uid(), company_id, 'Customer Service')
    OR public.has_module_access(auth.uid(), company_id, 'Operations')
  );

-- 9. Support messages policies (CS module or Operations or customer self-access)
CREATE POLICY "Customers can view own messages." ON public.support_messages
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  );

CREATE POLICY "Customers can insert own messages." ON public.support_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    AND sender_type = 'customer'
  );

CREATE POLICY "Customer Service module support_messages" ON public.support_messages
  FOR ALL TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets st
      WHERE public.has_module_access(auth.uid(), st.company_id, 'Customer Service')
         OR public.has_module_access(auth.uid(), st.company_id, 'Operations')
    )
  )
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.support_tickets st
      WHERE public.has_module_access(auth.uid(), st.company_id, 'Customer Service')
         OR public.has_module_access(auth.uid(), st.company_id, 'Operations')
    )
  );
