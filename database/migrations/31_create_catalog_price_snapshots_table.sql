-- Migration 31: Create catalog_price_snapshots table
CREATE TABLE IF NOT EXISTS public.catalog_price_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  prices      JSONB NOT NULL, -- Array of pricing objects: [{sku: "SKU1", sale_price: 1000, ...}]
  source      TEXT NOT NULL DEFAULT 'catalog',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely add source column if table was previously created
ALTER TABLE public.catalog_price_snapshots ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'catalog';

-- Enable RLS
ALTER TABLE public.catalog_price_snapshots ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "Allow company members select catalog_price_snapshots" ON public.catalog_price_snapshots;
CREATE POLICY "Allow company members select catalog_price_snapshots" ON public.catalog_price_snapshots
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Write policy
DROP POLICY IF EXISTS "Allow company members write catalog_price_snapshots" ON public.catalog_price_snapshots;
CREATE POLICY "Allow company members write catalog_price_snapshots" ON public.catalog_price_snapshots
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
