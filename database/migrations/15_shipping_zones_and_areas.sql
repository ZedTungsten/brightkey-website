-- Migration: Shipping Zones and Areas Multi-Tenant Schema (15_shipping_zones_and_areas.sql)
-- Introduces zones (fee, is_active, name) and nested areas (city/region names).

-- 1. Create Shipping Zones Table
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  fee         INTEGER NOT NULL DEFAULT 0, -- fee in centavos (e.g. 15000 for ₱150.00)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Shipping Areas Table (Cities/Regions under a Zone)
CREATE TABLE IF NOT EXISTS public.shipping_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  zone_id     UUID REFERENCES public.shipping_zones(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL, -- e.g. "Pasig City", "Makati City", "Cebu City"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_area_name_company UNIQUE (name, company_id)
);

-- 3. Enable RLS
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_areas ENABLE ROW LEVEL SECURITY;

-- 4. Define Policies for shipping_zones
DROP POLICY IF EXISTS "Public read active shipping zones" ON public.shipping_zones;
CREATE POLICY "Public read active shipping zones" ON public.shipping_zones
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Company staff manage shipping zones" ON public.shipping_zones;
CREATE POLICY "Company staff manage shipping zones" ON public.shipping_zones
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- 5. Define Policies for shipping_areas
DROP POLICY IF EXISTS "Public read shipping areas" ON public.shipping_areas;
CREATE POLICY "Public read shipping areas" ON public.shipping_areas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Company staff manage shipping areas" ON public.shipping_areas;
CREATE POLICY "Company staff manage shipping areas" ON public.shipping_areas
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies 
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );
