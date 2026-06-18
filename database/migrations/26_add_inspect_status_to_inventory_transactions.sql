-- ============================================================
-- Migration: 26_add_inspect_status_to_inventory_transactions.sql
-- Modifies inventory_transactions and inventory tables to support
-- the new 'inspect' stage.
-- ============================================================

-- 1. Add inspect column to public.inventory
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS inspect INTEGER DEFAULT 0 NOT NULL;

-- 2. Add timestamp_inspect to public.inventory_transactions
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS timestamp_inspect TIMESTAMPTZ;

-- 3. Modify status check constraint in public.inventory_transactions
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_status_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_status_check
  CHECK (status IN ('ordered', 'received', 'inspect', 'reserved', 'packed', 'dispatched', 'returned', 'cancelled'));
