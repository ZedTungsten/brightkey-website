-- =============================================================================
-- BrightKey Inventory & Fulfillment Schema Update
-- Run this in your Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS and checks.
-- =============================================================================

-- 1. Alter public.inventory to add tracking columns if they don't exist
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reserved   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packed     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatched INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled  INTEGER NOT NULL DEFAULT 0;

-- 2. Create the inventory_transactions table
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT NOT NULL,
  quantity              INTEGER NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('supplier_order', 'customer_order')),
  status                TEXT NOT NULL CHECK (status IN ('ordered', 'received', 'reserved', 'packed', 'dispatched', 'returned', 'cancelled')),
  reference_id          TEXT, -- e.g. booking order_no or supplier PO ID
  customer_name         TEXT,
  customer_city         TEXT,
  
  -- State transition timestamps
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

DROP TRIGGER IF EXISTS trg_inventory_transactions_updated_at ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_updated_at
  BEFORE UPDATE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION update_inventory_transactions_updated_at();

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_inv_tx_sku          ON public.inventory_transactions(sku);
CREATE INDEX IF NOT EXISTS idx_inv_tx_status       ON public.inventory_transactions(status);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref_id       ON public.inventory_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created_at   ON public.inventory_transactions(created_at DESC);

-- 4. Row Level Security (RLS)
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Public Read/Write/Delete/Update matching the staging/anon setup)
DROP POLICY IF EXISTS "Allow public select transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public insert transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public update transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow public delete transactions" ON public.inventory_transactions;

CREATE POLICY "Allow public select" ON public.inventory_transactions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.inventory_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.inventory_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.inventory_transactions FOR DELETE USING (true);
