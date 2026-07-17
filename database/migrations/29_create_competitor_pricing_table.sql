-- Migration 29: Create competitors and competitor_products tables for Pricing Strategy
CREATE TABLE IF NOT EXISTS public.competitors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  business_name TEXT NOT NULL,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.competitor_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,
  product_name  TEXT NOT NULL DEFAULT '',
  base_price    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_products ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "Allow company members select competitors" ON public.competitors
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members select competitor_products" ON public.competitor_products
  FOR SELECT USING (
    competitor_id IN (
      SELECT comp.id FROM public.competitors comp
      JOIN public.companies c ON comp.company_id = c.id
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Write policies
CREATE POLICY "Allow company members write competitors" ON public.competitors
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members write competitor_products" ON public.competitor_products
  FOR ALL USING (
    competitor_id IN (
      SELECT comp.id FROM public.competitors comp
      JOIN public.companies c ON comp.company_id = c.id
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
