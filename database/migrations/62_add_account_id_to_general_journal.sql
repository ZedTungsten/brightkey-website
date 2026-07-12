-- Add account_id column referencing public.journal_accounts
ALTER TABLE public.general_journal ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES public.journal_accounts(id) ON DELETE SET NULL;

-- Backfill existing entries by matching names
UPDATE public.general_journal gj
SET account_id = ja.id
FROM public.journal_accounts ja
WHERE gj.account = ja.name AND gj.company_id = ja.company_id;
