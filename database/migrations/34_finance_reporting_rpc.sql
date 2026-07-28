-- Finance reporting RPCs. Non-destructive and safe to rerun.
-- Summary totals are computed in PostgreSQL; detail rows are capped for UI safety.

CREATE OR REPLACE FUNCTION public.get_finance_cash_ledger_report(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT COALESCE(value, '{}'::JSONB) AS value
    FROM public.global_settings
    WHERE company_id = p_company_id
      AND key = 'cash_starting_balances'
    LIMIT 1
  ),
  accounts AS (
    SELECT
      a.id,
      a.name,
      a.category,
      COALESCE(
        (s.value -> p_start_date::TEXT ->> a.id::TEXT)::NUMERIC,
        (s.value -> p_start_date::TEXT ->> a.name)::NUMERIC,
        0
      ) AS starting_balance,
      COALESCE(SUM(j.debit), 0)::NUMERIC AS total_debit,
      COALESCE(SUM(j.credit), 0)::NUMERIC AS total_credit
    FROM public.journal_accounts a
    CROSS JOIN LATERAL (SELECT COALESCE((SELECT value FROM settings), '{}'::JSONB) AS value) s
    LEFT JOIN public.general_journal j
      ON j.company_id = p_company_id
      AND j.date >= p_start_date
      AND j.date <= p_end_date
      AND (
        j.account_id = a.id
        OR (j.account_id IS NULL AND LOWER(TRIM(j.account)) = LOWER(TRIM(a.name)))
      )
    WHERE a.company_id = p_company_id
      AND a.category = 'Cash & Cash Equivalents'
    GROUP BY a.id, a.name, a.category, s.value
  ),
  detail AS (
    SELECT
      j.id,
      j.entry_number,
      j.date,
      j.account_id,
      j.account,
      j.debit,
      j.credit,
      j.description_1,
      j.description_2
    FROM public.general_journal j
    WHERE j.company_id = p_company_id
      AND j.date >= p_start_date
      AND j.date <= p_end_date
    ORDER BY j.date ASC, j.entry_number ASC, j.id ASC
    LIMIT 5000
  )
  SELECT jsonb_build_object(
    'accounts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'category', a.category,
          'starting_balance', a.starting_balance,
          'total_debit', a.total_debit,
          'total_credit', a.total_credit,
          'net_movement', a.total_debit - a.total_credit,
          'ending_balance', a.starting_balance + a.total_debit - a.total_credit
        ) ORDER BY a.name
      ) FROM accounts a
    ), '[]'::JSONB),
    'entries', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date, d.entry_number, d.id) FROM detail d), '[]'::JSONB),
    'truncated', (
      SELECT COUNT(*) > 5000
      FROM public.general_journal j
      WHERE j.company_id = p_company_id
        AND j.date >= p_start_date
        AND j.date <= p_end_date
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_finance_cash_ledger_report(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_cash_ledger_report(UUID, DATE, DATE) TO authenticated;
