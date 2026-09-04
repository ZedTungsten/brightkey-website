CREATE TABLE IF NOT EXISTS public.warehouse_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  code TEXT NOT NULL,
  media_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  inspected_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  inspected_by_name TEXT NOT NULL,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warehouse_inspections_code_format CHECK (code = UPPER(BTRIM(code)) AND BTRIM(code) <> ''),
  CONSTRAINT warehouse_inspections_media_limit CHECK (CARDINALITY(media_urls) BETWEEN 1 AND 5),
  CONSTRAINT warehouse_inspections_company_code_unique UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS warehouse_inspections_company_date_idx
  ON public.warehouse_inspections (company_id, inspected_at DESC);

ALTER TABLE public.warehouse_inspections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspections'
      AND policyname = 'Logistics can read warehouse inspections'
  ) THEN
    CREATE POLICY "Logistics can read warehouse inspections"
      ON public.warehouse_inspections FOR SELECT TO authenticated
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspections'
      AND policyname = 'Logistics can create warehouse inspections'
  ) THEN
    CREATE POLICY "Logistics can create warehouse inspections"
      ON public.warehouse_inspections FOR INSERT TO authenticated
      WITH CHECK (
        public.has_module_access((SELECT auth.uid()), company_id, 'Logistics')
        AND EXISTS (
          SELECT 1 FROM public.products product
          WHERE product.id = product_id AND product.company_id = company_id
        )
        AND EXISTS (
          SELECT 1 FROM public.employees employee
          WHERE employee.id = inspected_by AND employee.company_id = company_id
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT ON public.warehouse_inspections TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Logistics can upload warehouse inspection media'
  ) THEN
    CREATE POLICY "Logistics can upload warehouse inspection media"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'brightkey-assets'
        AND (storage.foldername(name))[1] = 'companies'
        AND (storage.foldername(name))[3] = 'warehouse-inspected'
        AND public.has_module_access(
          (SELECT auth.uid()),
          CASE
            WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN ((storage.foldername(name))[2])::UUID
            ELSE NULL
          END,
          'Logistics'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Logistics can delete warehouse inspection media'
  ) THEN
    CREATE POLICY "Logistics can delete warehouse inspection media"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'brightkey-assets'
        AND owner_id = (SELECT auth.uid())::TEXT
        AND (storage.foldername(name))[1] = 'companies'
        AND (storage.foldername(name))[3] = 'warehouse-inspected'
        AND public.has_module_access(
          (SELECT auth.uid()),
          CASE
            WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN ((storage.foldername(name))[2])::UUID
            ELSE NULL
          END,
          'Logistics'
        )
      );
  END IF;
END $$;
