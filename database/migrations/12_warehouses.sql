-- ============================================================
-- Migration: 12_warehouses.sql
-- Creates the warehouses, warehouse_managers, and warehouse_transfers
-- tables, alters inventory to track per-warehouse stock levels,
-- backfills legacy records, and establishes RLS policies.
-- ============================================================

DROP TABLE IF EXISTS public.warehouse_transfers CASCADE;
DROP TABLE IF EXISTS public.warehouse_managers CASCADE;
DROP TABLE IF EXISTS public.warehouses CASCADE;

-- ── 1. Create warehouses Table ──────────────────────────────────────────
CREATE TABLE public.warehouses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  street_address text,
  city        text,
  province    text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Create warehouse_managers Table ──────────────────────────────────
CREATE TABLE public.warehouse_managers (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid    NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  user_id      uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_inspect  boolean NOT NULL DEFAULT true,
  can_pack     boolean NOT NULL DEFAULT true,
  can_dispatch boolean NOT NULL DEFAULT true,
  can_receive  boolean NOT NULL DEFAULT true,
  can_transfer boolean NOT NULL DEFAULT true,
  can_order    boolean NOT NULL DEFAULT true,
  can_edit_stocks boolean NOT NULL DEFAULT true,
  can_manage_all_orders boolean NOT NULL DEFAULT true,
  can_cancel   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, user_id)
);

-- ── 3. Alter inventory and inventory_transactions ───────────────────────

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_id ON public.inventory(warehouse_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_warehouse_sku_unique'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_warehouse_sku_unique UNIQUE (warehouse_id, sku);
  END IF;
END $$;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse_id ON public.inventory_transactions(warehouse_id);

-- ── 4. Backfill legacy records to the first warehouse of each tenant ────

UPDATE public.inventory inv
SET warehouse_id = (
  SELECT it.warehouse_id
  FROM public.inventory_transactions it
  WHERE it.sku = inv.sku
    AND it.warehouse_id IS NOT NULL
  LIMIT 1
)
WHERE inv.warehouse_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.inventory_transactions it2
    WHERE it2.sku = inv.sku AND it2.warehouse_id IS NOT NULL
  );

UPDATE public.inventory
SET warehouse_id = (
  SELECT id FROM public.warehouses ORDER BY created_at ASC LIMIT 1
)
WHERE warehouse_id IS NULL;

UPDATE public.inventory_transactions
SET warehouse_id = (
  SELECT id FROM public.warehouses ORDER BY created_at ASC LIMIT 1
)
WHERE warehouse_id IS NULL;

-- ── 5. Create warehouse_transfers Table ─────────────────────────────────

CREATE TABLE public.warehouse_transfers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_warehouse_id     uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id       uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  sku                   text        NOT NULL,
  quantity              integer     NOT NULL CHECK (quantity > 0),
  status                text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'received')),
  requested_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_id        ON public.warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_managers_wh_id    ON public.warehouse_managers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_managers_user_id  ON public.warehouse_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_company_id ON public.warehouse_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_wh ON public.warehouse_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_wh   ON public.warehouse_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_status  ON public.warehouse_transfers(status);

-- ── 7. Row Level Security Policies ──────────────────────────────────────

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

-- Warehouses Policies (Logistics module role-gated)
CREATE POLICY "Logistics module warehouses" ON public.warehouses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.tenant_id = warehouses.tenant_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.tenant_id = warehouses.tenant_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  );

-- Warehouse Managers Policies
CREATE POLICY "Logistics module warehouse_managers" ON public.warehouse_managers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouses w
      JOIN public.companies c ON c.tenant_id = w.tenant_id
      WHERE w.id = warehouse_managers.warehouse_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.warehouses w
      JOIN public.companies c ON c.tenant_id = w.tenant_id
      WHERE w.id = warehouse_managers.warehouse_id
        AND public.has_module_access(auth.uid(), c.id, 'Logistics')
      LIMIT 1
    )
  );

-- Warehouse Transfers Policies
CREATE POLICY "Logistics module warehouse_transfers" ON public.warehouse_transfers
  FOR ALL TO authenticated
  USING     (public.has_module_access(auth.uid(), company_id, 'Logistics'))
  WITH CHECK (public.has_module_access(auth.uid(), company_id, 'Logistics'));
