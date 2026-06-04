-- Migration 37: Add is_payment_account flag and ensure payment accounts exist

-- 1. Add is_payment_account column
ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS is_payment_account BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Insert missing payment accounts (system-wide, company_id NULL)
INSERT INTO public.bookkeeping_accounts (account_code, account_name, account_type, is_payment_account)
VALUES
  ('1050', 'Warehouse Cash',      'Asset', TRUE),
  ('1060', 'Petty Cash - General','Asset', TRUE),
  ('1070', 'Petty Cash - John',   'Asset', TRUE)
ON CONFLICT DO NOTHING;

-- 3. Mark existing accounts as payment accounts
UPDATE public.bookkeeping_accounts
SET is_payment_account = TRUE
WHERE account_name IN (
  'CIMB Bank',
  'GCash',
  'Cash on Hand',
  'Savings Account',
  'PayMongo Clearing'
)
AND company_id IS NULL;
