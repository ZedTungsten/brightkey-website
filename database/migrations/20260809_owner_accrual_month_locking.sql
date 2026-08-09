CREATE TABLE IF NOT EXISTS public.locked_owner_accrual_statements (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  statement_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, owner_id, month)
);

ALTER TABLE public.locked_owner_accrual_statements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locked_owner_accrual_statements' AND policyname = 'Company members read owner accrual locks') THEN
    CREATE POLICY "Company members read owner accrual locks" ON public.locked_owner_accrual_statements
      FOR SELECT USING (company_id IN (
        SELECT company.id FROM public.companies AS company
        JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
        WHERE member.user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locked_owner_accrual_statements' AND policyname = 'Company members manage owner accrual locks') THEN
    CREATE POLICY "Company members manage owner accrual locks" ON public.locked_owner_accrual_statements
      FOR ALL USING (company_id IN (
        SELECT company.id FROM public.companies AS company
        JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
        WHERE member.user_id = auth.uid()
      )) WITH CHECK (
        company_id IN (
          SELECT company.id FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE member.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.employees AS owner
          WHERE owner.id = owner_id AND owner.company_id = company_id
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_owner_accrual_monthly_totals(
  p_company_id UUID,
  p_owner_id UUID,
  p_months TEXT[]
)
RETURNS TABLE (month TEXT, account_type TEXT, net_total NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH classified AS (
    SELECT
      to_char(journal.date, 'YYYY-MM') AS month,
      CASE
        WHEN lower(account.name) LIKE '%company loan repayment%' OR lower(account.name) LIKE '%loan repayment%' THEN 'company_loan_repayment'
        WHEN lower(account.name) LIKE '%due from owner%' THEN 'due_from'
        WHEN lower(account.name) LIKE '%company loan%' THEN 'company_loan'
        WHEN lower(account.name) LIKE '%owner loan%' THEN 'owner_loan'
        WHEN lower(account.name) LIKE '%survival%' THEN 'survival'
        ELSE NULL
      END AS account_type,
      COALESCE(journal.debit, 0) AS debit,
      COALESCE(journal.credit, 0) AS credit
    FROM public.general_journal AS journal
    JOIN public.journal_accounts AS account
      ON account.id = journal.account_id
     AND account.company_id = journal.company_id
    JOIN public.global_settings AS assignment
      ON assignment.company_id = journal.company_id
     AND assignment.key = 'journal_account_employee_assignments'
    WHERE journal.company_id = p_company_id
      AND assignment.value -> 'assignments' ->> account.id::text = p_owner_id::text
      AND to_char(journal.date, 'YYYY-MM') = ANY (p_months)
  )
  SELECT
    classified.month,
    classified.account_type,
    SUM(classified.debit - classified.credit) AS net_total
  FROM classified
  WHERE classified.account_type IS NOT NULL
  GROUP BY classified.month, classified.account_type
  ORDER BY classified.month DESC, classified.account_type;
$$;

REVOKE ALL ON FUNCTION public.get_owner_accrual_monthly_totals(UUID, UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_accrual_monthly_totals(UUID, UUID, TEXT[]) TO authenticated;
