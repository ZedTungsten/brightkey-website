-- Distinguish deposits from later payments and retain their optional General Journal link.
-- Non-destructive and rerunnable for existing receivable payment history.
ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT,
  ADD COLUMN IF NOT EXISTS journal_entry_number INTEGER,
  ADD COLUMN IF NOT EXISTS debited_account TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receivable_payments_transaction_type_check'
  ) THEN
    ALTER TABLE public.receivable_payments
      ADD CONSTRAINT receivable_payments_transaction_type_check
      CHECK (transaction_type IN ('deposit', 'payment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_receivable_payments_company_booking_date
  ON public.receivable_payments (company_id, booking_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_receivable_payments_company_journal_entry
  ON public.receivable_payments (company_id, journal_entry_number)
  WHERE journal_entry_number IS NOT NULL;
