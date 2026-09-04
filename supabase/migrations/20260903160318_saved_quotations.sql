-- Named, immutable quotation snapshots. Listing omits the potentially large JSON.
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 120),
  snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND snapshot ?& ARRAY['version', 'pages', 'branding', 'date']
    AND snapshot->>'version' = '1'
    AND jsonb_typeof(snapshot->'pages') = 'array'
    AND jsonb_array_length(snapshot->'pages') > 0
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Matches the company-scoped, newest-first 51-row list query and FK cleanup.
CREATE INDEX IF NOT EXISTS quotations_company_created_id_idx
  ON public.quotations (company_id, created_at DESC, id DESC);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quotations FROM anon, authenticated;
GRANT SELECT, INSERT ON public.quotations TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotations' AND policyname='quotation_sales_read') THEN
    CREATE POLICY quotation_sales_read ON public.quotations FOR SELECT TO authenticated USING (
      company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
        WHERE tm.user_id = (SELECT auth.uid())
          AND (tm.role IN ('owner','admin') OR EXISTS (
            SELECT 1 FROM unnest(tm.accessible_modules) AS module_name
            WHERE lower(btrim(module_name)) = 'sales'
          ))
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotations' AND policyname='quotation_sales_insert') THEN
    CREATE POLICY quotation_sales_insert ON public.quotations FOR INSERT TO authenticated WITH CHECK (
      company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
        WHERE tm.user_id = (SELECT auth.uid())
          AND (tm.role IN ('owner','admin') OR EXISTS (
            SELECT 1 FROM unnest(tm.accessible_modules) AS module_name
            WHERE lower(btrim(module_name)) = 'sales'
          ))
      )
    );
  END IF;
END $$;
