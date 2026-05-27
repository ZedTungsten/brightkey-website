-- =============================================================================
-- BrightKey Consolidated Operations Schema (03_operations_schema.sql)
-- Consolidates shipping, inventory ledger, orders, installations, tickets
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables and views in dependency order
DROP TABLE IF EXISTS public.support_messages CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.vouchers CASCADE;
DROP TABLE IF EXISTS public.installation_bookings CASCADE;
DROP TABLE IF EXISTS public.installations CASCADE;
DROP TABLE IF EXISTS public.inventory_transactions CASCADE;
DROP TABLE IF EXISTS public.inventory_logs CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.shipping_rates CASCADE;
DROP TYPE IF EXISTS public.inventory_event_type;

-- ── 1. Shipping Rates ────────────────────────────────────────────────────────
CREATE TABLE public.shipping_rates (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city                TEXT UNIQUE NOT NULL,
  fee                 INTEGER, -- 0 = Free, fee in centavos, NULL = N/A
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Shipping Rates
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public shipping rates viewable by everyone." ON public.shipping_rates FOR SELECT USING (true);

-- ── 2. Orders ────────────────────────────────────────────────────────────────
CREATE TABLE public.orders (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  customer_name       TEXT NOT NULL,
  customer_email      TEXT NOT NULL,
  customer_phone      TEXT,
  shipping_city       TEXT,
  shipping_address    TEXT,
  total_amount        INTEGER NOT NULL,
  shipping_fee        INTEGER,
  payment_intent_id   TEXT,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'cancelled')),
  channel             TEXT DEFAULT 'ecommerce' CHECK (channel IN ('ecommerce', 'installation')),
  fulfillment_status  TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert orders." ON public.orders FOR INSERT WITH CHECK (true);

-- ── 3. Order Items ───────────────────────────────────────────────────────────
CREATE TABLE public.order_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id            UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  price_at_purchase   INTEGER NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Order Items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert order items." ON public.order_items FOR INSERT WITH CHECK (true);

-- ── 4. Inventory Table ───────────────────────────────────────────────────────
CREATE TABLE public.inventory (
  product_id          UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  available           INTEGER DEFAULT 0 NOT NULL,
  incoming            INTEGER DEFAULT 0 NOT NULL,
  returned            INTEGER DEFAULT 0 NOT NULL,
  reserved            INTEGER DEFAULT 0 NOT NULL,
  packed              INTEGER DEFAULT 0 NOT NULL,
  dispatched          INTEGER DEFAULT 0 NOT NULL,
  cancelled           INTEGER DEFAULT 0 NOT NULL,
  ordered_past_month  INTEGER DEFAULT 0 NOT NULL,
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public inventory viewable by everyone." ON public.inventory FOR SELECT USING (true);

-- ── 5. Inventory Logs (Ledger event type and logs) ──────────────────────────
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
  product_id          UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  event_type          public.inventory_event_type NOT NULL,
  quantity_change     INTEGER NOT NULL,
  reference_id        UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Inventory Logs
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read inventory logs." ON public.inventory_logs FOR SELECT USING (true);

-- Trigger to automate Inventory summarization from logs
CREATE OR REPLACE FUNCTION public.process_inventory_log_entry()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.inventory (product_id, available, incoming, reserved, dispatched, returned)
  VALUES (NEW.product_id, 0, 0, 0, 0, 0)
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

CREATE TRIGGER trg_process_inventory_log
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.process_inventory_log_entry();

-- ── 6. Inventory Transactions (State transitions) ───────────────────────────
CREATE TABLE public.inventory_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT NOT NULL,
  quantity              INTEGER NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('supplier_order', 'customer_order')),
  status                TEXT NOT NULL CHECK (status IN ('ordered', 'received', 'reserved', 'packed', 'dispatched', 'returned', 'cancelled')),
  reference_id          TEXT,
  customer_name         TEXT,
  customer_city         TEXT,
  
  timestamp_ordered     TIMESTAMPTZ,
  timestamp_received    TIMESTAMPTZ,
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

CREATE TRIGGER trg_inventory_transactions_updated_at
  BEFORE UPDATE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION update_inventory_transactions_updated_at();

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_inv_tx_sku          ON public.inventory_transactions(sku);
CREATE INDEX IF NOT EXISTS idx_inv_tx_status       ON public.inventory_transactions(status);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref_id       ON public.inventory_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created_at   ON public.inventory_transactions(created_at DESC);

-- RLS Inventory Transactions
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select" ON public.inventory_transactions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.inventory_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.inventory_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.inventory_transactions FOR DELETE USING (true);

-- ── 7. Installations Table ───────────────────────────────────────────────────
CREATE TABLE public.installations (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- RLS Installations
ALTER TABLE public.installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read installations." ON public.installations FOR SELECT USING (true);

-- ── 8. Installation Bookings Table ───────────────────────────────────────────
CREATE TABLE public.installation_bookings (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
  subtotal            NUMERIC(10,2),
  charges             NUMERIC(10,2) DEFAULT 0,
  deductions          NUMERIC(10,2) DEFAULT 0,
  grand_total         NUMERIC(10,2),
  deposit_amount      NUMERIC(10,2),
  balance_due         NUMERIC(10,2),
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

CREATE TRIGGER set_installation_bookings_updated_at
  BEFORE UPDATE ON public.installation_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Indexes for bookings
CREATE INDEX IF NOT EXISTS idx_installation_bookings_folder_ref ON public.installation_bookings (folder_ref_id);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_date ON public.installation_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_status ON public.installation_bookings (status);
CREATE INDEX IF NOT EXISTS idx_installation_bookings_created ON public.installation_bookings (created_at DESC);

-- RLS Installation Bookings
ALTER TABLE public.installation_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert installation_bookings" ON public.installation_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read installation_bookings" ON public.installation_bookings FOR SELECT USING (true);
CREATE POLICY "Allow public update installation_bookings" ON public.installation_bookings FOR UPDATE USING (true);

-- ── 9. Vouchers / Rewards ────────────────────────────────────────────────────
CREATE TABLE public.vouchers (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  code                TEXT UNIQUE NOT NULL,
  discount_value      NUMERIC(10,2) NOT NULL,
  discount_type       TEXT CHECK (discount_type IN ('fixed', 'percentage')),
  is_used             BOOLEAN DEFAULT FALSE,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Vouchers
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own vouchers." ON public.vouchers FOR SELECT USING (auth.uid() = user_id);

-- ── 10. Support Tickets ──────────────────────────────────────────────────────
CREATE TABLE public.support_tickets (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  subject             TEXT NOT NULL,
  status              TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Support Tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own tickets." ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Customers can insert own tickets." ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 11. Support Messages ─────────────────────────────────────────────────────
CREATE TABLE public.support_messages (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id           UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin')),
  sender_id           UUID,
  message             TEXT NOT NULL,
  attachment_urls     JSONB DEFAULT '[]'::JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Support Messages
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own messages." ON public.support_messages FOR SELECT USING (
  ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
);
CREATE POLICY "Customers can insert own messages." ON public.support_messages FOR INSERT WITH CHECK (
  ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  AND sender_type = 'customer'
);
