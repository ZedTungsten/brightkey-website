-- Compatibility-preserving security and General Journal query hardening.
-- Authenticated tenant members retain the same company-wide access.

ALTER TABLE public.company_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_journal ENABLE ROW LEVEL SECURITY;

-- Remove legacy unrestricted policies discovered in the live project.
DROP POLICY IF EXISTS "public_all" ON public.general_journal;
DROP POLICY IF EXISTS "Allow all write for settings" ON public.global_settings;

DROP POLICY IF EXISTS "Allow public read for settings" ON public.global_settings;
CREATE POLICY "Allow public storefront settings read"
  ON public.global_settings
  FOR SELECT
  TO anon
  USING (key IN (
    'free_shipping',
    'free_gifts',
    'upsell_cross_sell',
    'delivery_lead_time',
    'promo_popup',
    'invoice_template'
  ));

DROP POLICY IF EXISTS "Allow tenant members integrations access" ON public.company_integrations;
CREATE POLICY "Allow tenant members integrations access"
  ON public.company_integrations
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE VIEW public.view_public_integrations
WITH (security_invoker = false)
AS
SELECT
  company_id,
  (paymongo_public_key IS NOT NULL AND paymongo_secret_key IS NOT NULL) AS paymongo_configured,
  (stripe_public_key IS NOT NULL AND stripe_secret_key IS NOT NULL) AS stripe_configured,
  paymongo_public_key,
  stripe_public_key
FROM public.company_integrations;

GRANT SELECT ON public.view_public_integrations TO anon, authenticated;

DROP POLICY IF EXISTS "Allow tenant members journal access" ON public.general_journal;
CREATE POLICY "Allow tenant members journal access"
  ON public.general_journal
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_general_journal_summary(
  p_company_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL,
  p_accounts TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_search_entry_number INTEGER DEFAULT NULL,
  p_search_number NUMERIC DEFAULT NULL,
  p_search_is_integer BOOLEAN DEFAULT FALSE,
  p_snapshot_entry_numbers INTEGER[] DEFAULT NULL,
  p_snapshot_months TEXT[] DEFAULT NULL
)
RETURNS TABLE(sum_debit NUMERIC, sum_credit NUMERIC, row_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(gj.debit), 0),
    COALESCE(SUM(gj.credit), 0),
    COUNT(*)
  FROM public.general_journal gj
  WHERE gj.company_id = p_company_id
    AND (p_date_from IS NULL OR gj.date >= p_date_from)
    AND (p_date_to IS NULL OR gj.date <= p_date_to)
    AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL OR p_year IS NULL OR gj.year = p_year)
    AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL OR p_month IS NULL OR gj.month = p_month)
    AND (p_accounts IS NULL OR cardinality(p_accounts) = 0 OR gj.account = ANY(p_accounts))
    AND (
      (COALESCE(cardinality(p_snapshot_entry_numbers), 0) = 0 AND gj.entry_number > 0)
      OR
      (COALESCE(cardinality(p_snapshot_entry_numbers), 0) > 0 AND (
        gj.entry_number = ANY(p_snapshot_entry_numbers)
        OR (
          gj.entry_number > 0
          AND NOT (to_char(gj.date, 'YYYY-MM') = ANY(p_snapshot_months))
        )
      ))
    )
    AND (
      NULLIF(BTRIM(p_search), '') IS NULL
      OR gj.account ILIKE '%' || p_search || '%'
      OR COALESCE(gj.description_1, '') ILIKE '%' || p_search || '%'
      OR COALESCE(gj.description_2, '') ILIKE '%' || p_search || '%'
      OR (p_search_entry_number IS NOT NULL AND gj.entry_number = p_search_entry_number)
      OR (p_search_number IS NOT NULL AND (gj.debit = p_search_number OR gj.credit = p_search_number))
      OR (p_search_number IS NOT NULL AND p_search_is_integer AND (
        (gj.debit >= p_search_number AND gj.debit < p_search_number + 1)
        OR (gj.credit >= p_search_number AND gj.credit < p_search_number + 1)
      ))
    );
$$;

REVOKE ALL ON FUNCTION public.get_general_journal_summary(UUID, DATE, DATE, INTEGER, INTEGER, TEXT[], TEXT, INTEGER, NUMERIC, BOOLEAN, INTEGER[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_general_journal_summary(UUID, DATE, DATE, INTEGER, INTEGER, TEXT[], TEXT, INTEGER, NUMERIC, BOOLEAN, INTEGER[], TEXT[]) TO authenticated;
