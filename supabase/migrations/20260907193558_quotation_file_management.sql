GRANT UPDATE, DELETE ON public.quotations TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotations' AND policyname='quotation_sales_update') THEN
    CREATE POLICY quotation_sales_update ON public.quotations FOR UPDATE TO authenticated USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE tm.user_id = (SELECT auth.uid())
        AND (tm.role IN ('owner','admin') OR EXISTS (
          SELECT 1 FROM unnest(tm.accessible_modules) AS module_name
          WHERE lower(btrim(module_name)) = 'sales'
        ))
    )
    ) WITH CHECK (
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

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotations' AND policyname='quotation_sales_delete') THEN
    CREATE POLICY quotation_sales_delete ON public.quotations FOR DELETE TO authenticated USING (
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
