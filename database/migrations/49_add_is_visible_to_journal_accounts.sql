-- Add is_visible column to journal_accounts table
ALTER TABLE public.journal_accounts ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;
