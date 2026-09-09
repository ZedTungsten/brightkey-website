ALTER TABLE public.warehouse_inspections
  ADD COLUMN IF NOT EXISTS inspection_status TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE public.warehouse_inspections
  ALTER COLUMN inspected_by_name DROP NOT NULL,
  ALTER COLUMN inspected_at DROP NOT NULL,
  ALTER COLUMN inspected_at DROP DEFAULT;

ALTER TABLE public.warehouse_inspections
  DROP CONSTRAINT IF EXISTS warehouse_inspections_media_limit;

ALTER TABLE public.warehouse_inspections
  ADD CONSTRAINT warehouse_inspections_media_limit
    CHECK (CARDINALITY(media_urls) BETWEEN 0 AND 5),
  ADD CONSTRAINT warehouse_inspections_status_valid
    CHECK (inspection_status IN ('pending', 'completed')),
  ADD CONSTRAINT warehouse_inspections_completion_valid
    CHECK (
      (inspection_status = 'pending'
        AND CARDINALITY(media_urls) = 0
        AND inspected_by IS NULL
        AND inspected_by_name IS NULL
        AND inspected_at IS NULL)
      OR
      (inspection_status = 'completed'
        AND CARDINALITY(media_urls) BETWEEN 1 AND 5
        AND inspected_by IS NOT NULL
        AND BTRIM(inspected_by_name) <> ''
        AND inspected_at IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS warehouse_inspections_pending_company_created_idx
  ON public.warehouse_inspections (company_id, created_at ASC)
  WHERE inspection_status = 'pending';

DROP POLICY IF EXISTS "Logistics can create warehouse inspections"
  ON public.warehouse_inspections;

CREATE POLICY "Logistics can create warehouse inspections"
  ON public.warehouse_inspections FOR INSERT TO authenticated
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'Logistics')
    AND EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.id = product_id AND product.company_id = company_id
    )
    AND (
      (inspection_status = 'pending' AND inspected_by IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.employees employee
        WHERE employee.id = inspected_by AND employee.company_id = company_id
      )
    )
  );

DROP POLICY IF EXISTS "Logistics can update warehouse inspections"
  ON public.warehouse_inspections;

CREATE POLICY "Logistics can update warehouse inspections"
  ON public.warehouse_inspections FOR UPDATE TO authenticated
  USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'))
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'Logistics')
    AND EXISTS (
      SELECT 1 FROM public.products product
      WHERE product.id = product_id AND product.company_id = company_id
    )
    AND (
      (inspection_status = 'pending' AND inspected_by IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.employees employee
        WHERE employee.id = inspected_by AND employee.company_id = company_id
      )
    )
  );
