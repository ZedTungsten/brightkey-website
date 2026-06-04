-- Migration 37: Add is_payment_account flag and ensure payment accounts exist

-- 1. Add is_payment_account column
ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS is_payment_account BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Insert missing accounts and flag all payment accounts scoped to BrightKey
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE subdomain = 'brightkey' LIMIT 1;

  -- Insert missing payment accounts under BrightKey
  INSERT INTO public.bookkeeping_accounts (company_id, account_code, account_name, account_type, is_payment_account)
  VALUES
    (v_company_id, '1050', 'Warehouse Cash',       'Asset', TRUE),
    (v_company_id, '1060', 'Petty Cash - General', 'Asset', TRUE),
    (v_company_id, '1070', 'Petty Cash - John',    'Asset', TRUE)
  ON CONFLICT DO NOTHING;

  -- Flag existing payment accounts — catches rows seeded as NULL (migration 31) and BrightKey-scoped rows
  UPDATE public.bookkeeping_accounts
  SET is_payment_account = TRUE
  WHERE account_name IN (
    'CIMB Bank',
    'GCash',
    'Cash on Hand',
    'Savings Account',
    'PayMongo Clearing'
  )
  AND (company_id IS NULL OR company_id = v_company_id);
END $$;
