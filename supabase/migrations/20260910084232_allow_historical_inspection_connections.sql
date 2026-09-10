DROP POLICY IF EXISTS "Logistics can create inspection allocations"
  ON public.warehouse_inspection_allocations;

CREATE POLICY "Logistics can create inspection allocations"
  ON public.warehouse_inspection_allocations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_module_access((SELECT auth.uid()), company_id, 'Logistics')
    AND allocated_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.inventory_transactions tx
      WHERE tx.id = warehouse_inspection_allocations.transaction_id
        AND tx.company_id = warehouse_inspection_allocations.company_id
        AND tx.reference_id = warehouse_inspection_allocations.reference_id
        AND tx.sku = warehouse_inspection_allocations.sku
        AND tx.type = 'customer_order'
        AND (
          tx.status IN ('reserved', 'inspect')
          OR (
            tx.timestamp_dispatched IS NOT NULL
            AND tx.timestamp_cancelled IS NULL
          )
        )
        AND warehouse_inspection_allocations.unit_index <= tx.quantity
    )
    AND EXISTS (
      SELECT 1
      FROM public.warehouse_inspections inspection
      WHERE inspection.id = warehouse_inspection_allocations.inspection_id
        AND inspection.company_id = warehouse_inspection_allocations.company_id
        AND inspection.sku = warehouse_inspection_allocations.sku
    )
  );
