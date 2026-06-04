-- Migration 38: Rewrite General Journal Entry Numbers sequentially from earliest created_at
-- This cleans up any duplicate entry numbers caused by past auto-increment bugs
-- and ensures that debit/credit pairs for the same transaction keep the same entry number.

WITH numbered_groups AS (
  -- 1. Identify distinct transactions (groups) within each company.
  -- Group by company_id, original entry_number, date, description, and exact created_at timestamp.
  -- This ensures debit and credit rows that were inserted together form a single transaction group.
  SELECT 
    company_id,
    entry_number AS old_entry_number,
    date,
    description_1,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY company_id 
      ORDER BY created_at ASC, date ASC, entry_number ASC
    ) AS new_entry_number
  FROM (
    SELECT DISTINCT 
      company_id, 
      entry_number, 
      date, 
      description_1, 
      created_at
    FROM public.general_journal
    WHERE entry_number > 0 -- only rewrite normal entries, keep snapshots (negative numbers) as is
  ) sub
),
gj_updates AS (
  -- 2. Update the general_journal table with the newly calculated sequential entry numbers.
  UPDATE public.general_journal gj
  SET entry_number = ng.new_entry_number
  FROM numbered_groups ng
  WHERE gj.company_id = ng.company_id
    AND gj.entry_number = ng.old_entry_number
    AND gj.date = ng.date
    AND COALESCE(gj.description_1, '') = COALESCE(ng.description_1, '')
    AND gj.created_at = ng.created_at
    AND gj.entry_number > 0
  RETURNING gj.company_id, ng.old_entry_number, ng.new_entry_number
)
-- 3. Update the bookkeeping table's entry_no to match the new entry_number where applicable.
UPDATE public.bookkeeping bk
SET entry_no = upd.new_entry_number
FROM (
  SELECT DISTINCT company_id, old_entry_number, new_entry_number
  FROM gj_updates
) upd
WHERE bk.company_id = upd.company_id
  AND bk.entry_no = upd.old_entry_number
  AND bk.entry_no > 0;
