-- Migration 39: Add Payment Accounts specific columns to bookkeeping_accounts
-- Supports tracking Credit Cards, Debit, E-Wallet, Cash, and other custom details.

ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS payment_account_type TEXT CHECK (payment_account_type IN ('debit', 'credit_card', 'cash_account', 'e_wallet', 'other_payment_account')),
  ADD COLUMN IF NOT EXISTS bank TEXT,
  ADD COLUMN IF NOT EXISTS statement_date INTEGER CHECK (statement_date BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS due_date INTEGER CHECK (due_date BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS credit_limit INTEGER, -- in centavos (pesos * 100)
  ADD COLUMN IF NOT EXISTS card_number_last_4 VARCHAR(4) CHECK (card_number_last_4 ~ '^\d{3,4}$'),
  ADD COLUMN IF NOT EXISTS card_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS rewards TEXT;
