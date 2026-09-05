DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspections'
      AND policyname = 'Logistics can update warehouse inspections'
  ) THEN
    CREATE POLICY "Logistics can update warehouse inspections"
      ON public.warehouse_inspections FOR UPDATE TO authenticated
      USING (public.has_module_access((SELECT auth.uid()), company_id, 'Logistics'))
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_inspections'
      AND policyname = 'Logistics can delete unallocated warehouse inspections'
  ) THEN
    CREATE POLICY "Logistics can delete unallocated warehouse inspections"
      ON public.warehouse_inspections FOR DELETE TO authenticated
      USING (
        public.has_module_access((SELECT auth.uid()), company_id, 'Logistics')
        AND NOT EXISTS (
          SELECT 1 FROM public.warehouse_inspection_allocations allocation
          WHERE allocation.inspection_id = warehouse_inspections.id
        )
      );
  END IF;
END $$;

GRANT UPDATE, DELETE ON public.warehouse_inspections TO authenticated;
