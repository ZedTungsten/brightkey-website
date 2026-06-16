-- ============================================================
-- Migration: 12_warehouses.sql
-- Creates the warehouses and warehouse_managers tables with
-- Row Level Security policies enforcing strict tenant isolation.
-- ============================================================

-- ── 1. warehouses ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warehouses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- Owner / Admin members of the tenant can do full CRUD
CREATE POLICY "Tenant members can select warehouses" ON public.warehouses
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owner/Admin can insert warehouses" ON public.warehouses
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner/Admin can update warehouses" ON public.warehouses
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner/Admin can delete warehouses" ON public.warehouses
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── 2. warehouse_managers ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warehouse_managers (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid    NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  user_id      uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_pack     boolean NOT NULL DEFAULT true,
  can_dispatch boolean NOT NULL DEFAULT true,
  can_cancel   boolean NOT NULL DEFAULT true,
  can_receive  boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, user_id)
);

ALTER TABLE public.warehouse_managers ENABLE ROW LEVEL SECURITY;

-- Anyone in the same tenant can read assignments (needed to check own perms)
CREATE POLICY "Tenant members can select warehouse_managers" ON public.warehouse_managers
  FOR SELECT USING (
    warehouse_id IN (
      SELECT id FROM public.warehouses
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

-- Only Owner / Admin can assign or remove managers
CREATE POLICY "Owner/Admin can insert warehouse_managers" ON public.warehouse_managers
  FOR INSERT WITH CHECK (
    warehouse_id IN (
      SELECT w.id FROM public.warehouses w
      JOIN public.tenant_members tm ON w.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner/Admin can delete warehouse_managers" ON public.warehouse_managers
  FOR DELETE USING (
    warehouse_id IN (
      SELECT w.id FROM public.warehouses w
      JOIN public.tenant_members tm ON w.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- ── 3. Indexes ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_id      ON public.warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_managers_wh_id  ON public.warehouse_managers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_managers_user_id ON public.warehouse_managers(user_id);
