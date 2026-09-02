-- Note-only payment entries for the booking details calendar view.
-- This field is intentionally independent from receipts and finance records.
ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS payment_ledger JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.installation_bookings.payment_ledger IS
  'Note-only payment entries; does not alter receipts, invoices, balances, or finance ledgers.';

ALTER TABLE public.installation_bookings
  DROP CONSTRAINT IF EXISTS installation_bookings_payment_ledger_shape;

ALTER TABLE public.installation_bookings
  ADD CONSTRAINT installation_bookings_payment_ledger_shape
  CHECK (jsonb_typeof(payment_ledger) = 'array');
