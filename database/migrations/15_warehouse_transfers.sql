-- ============================================================
-- Migration: 15_warehouse_transfers.sql
-- Creates the warehouse_transfers table to manage stock transfers and requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
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

-- Enable RLS
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

-- Scoped access policies: Company members can do full operations on transfers in their company
CREATE POLICY "Company members can access warehouse_transfers" ON public.warehouse_transfers
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_company_id ON public.warehouse_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_wh ON public.warehouse_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_wh ON public.warehouse_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_status ON public.warehouse_transfers(status);
