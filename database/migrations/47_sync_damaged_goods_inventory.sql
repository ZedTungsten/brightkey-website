-- Keep issued damaged goods and warehouse availability in sync.
-- Non-destructive and rerunnable: existing unpacked records are reconciled by
-- the page-level RPC the next time the Damaged Goods page is loaded.

ALTER TABLE public.damaged_goods
  ADD COLUMN IF NOT EXISTS inventory_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inventory_reserved_sku TEXT,
  ADD COLUMN IF NOT EXISTS inventory_reserved_warehouse_id UUID,
  ADD COLUMN IF NOT EXISTS inventory_reserved_quantity INTEGER;

CREATE OR REPLACE FUNCTION public.sync_damaged_goods_inventory(
  p_damage_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  damage_row public.damaged_goods%ROWTYPE;
  supplier_name TEXT;
  supplier_city TEXT;
  target_warehouse_id UUID;
  target_quantity INTEGER;
  target_reference TEXT;
  transaction_id UUID;
  transaction_status TEXT;
  changed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO damage_row
  FROM public.damaged_goods
  WHERE id = p_damage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The damaged goods record could not be found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = damage_row.company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this damaged goods record.';
  END IF;

  target_quantity := GREATEST(COALESCE(damage_row.quantity, 1), 1);
  target_warehouse_id := COALESCE(
    p_warehouse_id,
    damage_row.inventory_reserved_warehouse_id,
    (
      SELECT warehouse_id
      FROM public.inventory_transactions
      WHERE id = damage_row.inventory_transaction_id
        AND company_id = damage_row.company_id
    )
  );

  -- Release a prior reservation when the record no longer represents unpacked
  -- warehouse stock, or its SKU/warehouse/quantity has changed.
  IF damage_row.inventory_reserved_at IS NOT NULL AND (
    COALESCE(damage_row.status, 'unpacked') <> 'unpacked'
    OR damage_row.archived_at IS NOT NULL
    OR damage_row.inventory_reserved_sku IS DISTINCT FROM damage_row.sku
    OR damage_row.inventory_reserved_warehouse_id IS DISTINCT FROM target_warehouse_id
    OR damage_row.inventory_reserved_quantity IS DISTINCT FROM target_quantity
  ) THEN
    SELECT status INTO transaction_status
    FROM public.inventory_transactions
    WHERE id = damage_row.inventory_transaction_id
      AND company_id = damage_row.company_id;

    IF transaction_status IS NOT NULL AND transaction_status <> 'inspect' THEN
      RAISE EXCEPTION 'Only an unpacked damaged item can be removed from warehouse inventory.';
    END IF;

    INSERT INTO public.inventory (company_id, warehouse_id, sku, available, reserved)
    VALUES (
      damage_row.company_id,
      damage_row.inventory_reserved_warehouse_id,
      damage_row.inventory_reserved_sku,
      damage_row.inventory_reserved_quantity,
      0
    )
    ON CONFLICT (company_id, warehouse_id, sku) DO UPDATE
    SET available = public.inventory.available + EXCLUDED.available,
        reserved = GREATEST(0, public.inventory.reserved - damage_row.inventory_reserved_quantity),
        updated_at = now();

    IF damage_row.inventory_transaction_id IS NOT NULL THEN
      DELETE FROM public.inventory_transactions
      WHERE id = damage_row.inventory_transaction_id
        AND company_id = damage_row.company_id
        AND status = 'inspect';
    END IF;

    UPDATE public.damaged_goods
    SET inventory_transaction_id = NULL,
        inventory_reserved_at = NULL,
        inventory_reserved_sku = NULL,
        inventory_reserved_warehouse_id = NULL,
        inventory_reserved_quantity = NULL,
        updated_at = now()
    WHERE id = damage_row.id;

    damage_row.inventory_transaction_id := NULL;
    damage_row.inventory_reserved_at := NULL;
    changed := TRUE;
  END IF;

  -- Customer-possession and archived items are deliberately excluded from the
  -- warehouse ledger.
  IF COALESCE(damage_row.status, 'unpacked') <> 'unpacked'
     OR damage_row.archived_at IS NOT NULL THEN
    -- Old customer-possession records may have been linked to Pack without ever
    -- changing inventory. Remove that stale inspect entry without touching stock.
    IF damage_row.inventory_reserved_at IS NULL
       AND damage_row.inventory_transaction_id IS NOT NULL THEN
      DELETE FROM public.inventory_transactions
      WHERE id = damage_row.inventory_transaction_id
        AND company_id = damage_row.company_id
        AND status = 'inspect';

      UPDATE public.damaged_goods
      SET inventory_transaction_id = NULL,
          updated_at = now()
      WHERE id = damage_row.id;
      changed := TRUE;
    END IF;
    RETURN changed;
  END IF;

  IF target_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Select a warehouse before issuing damaged goods.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = target_warehouse_id
      AND w.company_id = damage_row.company_id
  ) THEN
    RAISE EXCEPTION 'The selected warehouse is not available for this company.';
  END IF;

  IF damage_row.inventory_reserved_at IS NULL THEN
    target_reference := COALESCE(
      NULLIF(damage_row.reference_id, ''),
      'SND-DMG-' || to_char(COALESCE(damage_row.created_at, now()), 'YYYYMMDD') || '-' || upper(left(damage_row.id::text, 6))
    );

    SELECT s.name, COALESCE(s.city, s.province, '')
    INTO supplier_name, supplier_city
    FROM public.suppliers s
    WHERE s.id = damage_row.supplier_id
      AND s.company_id = damage_row.company_id;

    SELECT id INTO transaction_id
    FROM public.inventory_transactions
    WHERE company_id = damage_row.company_id
      AND warehouse_id = target_warehouse_id
      AND reference_id = target_reference
    ORDER BY created_at DESC
    LIMIT 1;

    IF transaction_id IS NULL THEN
      INSERT INTO public.inventory_transactions (
        company_id, warehouse_id, sku, quantity, type, status, reference_id,
        customer_name, customer_city, timestamp_inspect
      ) VALUES (
        damage_row.company_id, target_warehouse_id, damage_row.sku,
        target_quantity, 'customer_order', 'inspect', target_reference,
        COALESCE(supplier_name, 'Damaged Goods'), COALESCE(supplier_city, ''), now()
      ) RETURNING id INTO transaction_id;
    ELSE
      UPDATE public.inventory_transactions
      SET sku = damage_row.sku,
          quantity = target_quantity,
          customer_name = COALESCE(supplier_name, customer_name, 'Damaged Goods'),
          customer_city = COALESCE(supplier_city, customer_city, ''),
          updated_at = now()
      WHERE id = transaction_id
        AND company_id = damage_row.company_id;
    END IF;

    INSERT INTO public.inventory (company_id, warehouse_id, sku, available, reserved)
    VALUES (damage_row.company_id, target_warehouse_id, damage_row.sku, -target_quantity, target_quantity)
    ON CONFLICT (company_id, warehouse_id, sku) DO UPDATE
    SET available = public.inventory.available - target_quantity,
        reserved = public.inventory.reserved + target_quantity,
        updated_at = now();

    UPDATE public.damaged_goods
    SET inventory_transaction_id = transaction_id,
        reference_id = target_reference,
        inventory_reserved_at = now(),
        inventory_reserved_sku = damage_row.sku,
        inventory_reserved_warehouse_id = target_warehouse_id,
        inventory_reserved_quantity = target_quantity,
        updated_at = now()
    WHERE id = damage_row.id;

    changed := TRUE;
  END IF;

  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_damaged_goods_inventory(
  p_company_id UUID,
  p_warehouse_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  damage_id UUID;
  change_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = p_company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this company.';
  END IF;

  FOR damage_id IN
    SELECT d.id
    FROM public.damaged_goods d
    WHERE d.company_id = p_company_id
      AND d.archived_at IS NULL
      AND COALESCE(d.status, 'unpacked') = 'unpacked'
      AND d.inventory_reserved_at IS NULL
    ORDER BY d.created_at ASC
    LIMIT 200
  LOOP
    IF public.sync_damaged_goods_inventory(damage_id, p_warehouse_id) THEN
      change_count := change_count + 1;
    END IF;
  END LOOP;

  RETURN change_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_damaged_goods_record(p_damage_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  damage_row public.damaged_goods%ROWTYPE;
BEGIN
  SELECT * INTO damage_row
  FROM public.damaged_goods
  WHERE id = p_damage_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
    WHERE c.id = damage_row.company_id
      AND tm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this damaged goods record.';
  END IF;

  IF damage_row.inventory_reserved_at IS NOT NULL THEN
    UPDATE public.damaged_goods SET status = 'customer_possession' WHERE id = p_damage_id;
    PERFORM public.sync_damaged_goods_inventory(p_damage_id, damage_row.inventory_reserved_warehouse_id);
  ELSIF damage_row.inventory_transaction_id IS NOT NULL THEN
    DELETE FROM public.inventory_transactions
    WHERE id = damage_row.inventory_transaction_id
      AND company_id = damage_row.company_id
      AND status = 'inspect';
  END IF;

  DELETE FROM public.damaged_goods WHERE id = p_damage_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_damaged_goods_inventory(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_damaged_goods_inventory(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_damaged_goods_record(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_damaged_goods_inventory(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_damaged_goods_inventory(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_damaged_goods_record(UUID) TO authenticated;
