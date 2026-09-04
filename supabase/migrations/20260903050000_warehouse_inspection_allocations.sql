CREATE TABLE IF NOT EXISTS public.warehouse_inspection_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE CASCADE,
  inspection_id UUID NOT NULL REFERENCES public.warehouse_inspections(id) ON DELETE RESTRICT,
  unit_index INTEGER NOT NULL CHECK (unit_index > 0),
  reference_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  allocated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warehouse_inspection_allocations_transaction_unit_unique UNIQUE (transaction_id, unit_index),
  CONSTRAINT warehouse_inspection_allocations_inspection_unique UNIQUE (inspection_id)
);

CREATE INDEX IF NOT EXISTS warehouse_inspection_allocations_company_date_idx
  ON public.warehouse_inspection_allocations (company_id, allocated_at DESC);

ALTER TABLE public.warehouse_inspection_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspection_allocations'
      AND policyname = 'Logistics can read inspection allocations'
  ) THEN
    CREATE POLICY "Logistics can read inspection allocations"
      ON public.warehouse_inspection_allocations FOR SELECT TO authenticated
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspection_allocations'
      AND policyname = 'Logistics can create inspection allocations'
  ) THEN
    CREATE POLICY "Logistics can create inspection allocations"
      ON public.warehouse_inspection_allocations FOR INSERT TO authenticated
      WITH CHECK (
        public.has_module_access((SELECT auth.uid()), company_id, 'Logistics')
        AND allocated_by = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.inventory_transactions tx
          WHERE tx.id = warehouse_inspection_allocations.transaction_id
            AND tx.company_id = warehouse_inspection_allocations.company_id
            AND tx.reference_id = warehouse_inspection_allocations.reference_id
            AND tx.sku = warehouse_inspection_allocations.sku
            AND tx.type = 'customer_order'
            AND tx.status IN ('reserved', 'inspect')
            AND warehouse_inspection_allocations.unit_index <= tx.quantity
        )
        AND EXISTS (
          SELECT 1 FROM public.warehouse_inspections inspection
          WHERE inspection.id = warehouse_inspection_allocations.inspection_id
            AND inspection.company_id = warehouse_inspection_allocations.company_id
            AND inspection.sku = warehouse_inspection_allocations.sku
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspection_allocations'
      AND policyname = 'Logistics can delete inspection allocations'
  ) THEN
    CREATE POLICY "Logistics can delete inspection allocations"
      ON public.warehouse_inspection_allocations FOR DELETE TO authenticated
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'));
  END IF;
END $$;

GRANT SELECT, INSERT, DELETE ON public.warehouse_inspection_allocations TO authenticated;
