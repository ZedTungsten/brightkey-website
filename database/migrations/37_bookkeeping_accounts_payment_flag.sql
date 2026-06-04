-- Migration 37: Add is_payment_account flag and ensure payment accounts exist

-- 1. Add is_payment_account column
ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS is_payment_account BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Insert missing payment accounts scoped to BrightKey (inline subquery avoids DO-block RLS issues)
INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
SELECT id, '1050', 'Warehouse Cash',       'Asset', TRUE FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
SELECT id, '1060', 'Petty Cash - General', 'Asset', TRUE FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
SELECT id, '1070', 'Petty Cash - John',    'Asset', TRUE FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1
ON CONFLICT DO NOTHING;

-- 3. Flag existing payment accounts (seeded with company_id NULL in migration 31)
UPDATE public.bookkeeping_accounts
SET is_payment_account = TRUE
WHERE account_name IN (
  'CIMB Bank',
  'GCash',
  'Cash on Hand',
  'Savings Account',
  'PayMongo Clearing'
);
