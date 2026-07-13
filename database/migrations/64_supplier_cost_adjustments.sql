-- Migration: 64_supplier_cost_adjustments.sql
-- Create table to track adjustments to supplier cost under COGS

CREATE TABLE IF NOT EXISTS public.supplier_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, -- positive or negative value in centavos
  adjustment_date DATE NOT NULL, -- date the adjustment belongs to (for monthly scope)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.supplier_cost_adjustments ENABLE ROW LEVEL SECURITY;

-- Create policies conditionally to prevent execution crashes when rerun
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members read adjustments'
  ) THEN
    CREATE POLICY "Allow company members read adjustments" ON public.supplier_cost_adjustments
      FOR SELECT USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members insert adjustments'
  ) THEN
    CREATE POLICY "Allow company members insert adjustments" ON public.supplier_cost_adjustments
      FOR INSERT WITH CHECK (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members update adjustments'
  ) THEN
    CREATE POLICY "Allow company members update adjustments" ON public.supplier_cost_adjustments
      FOR UPDATE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_cost_adjustments' 
      AND policyname = 'Allow company members delete adjustments'
  ) THEN
    CREATE POLICY "Allow company members delete adjustments" ON public.supplier_cost_adjustments
      FOR DELETE USING (
        company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
          WHERE tm.user_id = auth.uid()
        )
      );
  END IF;
END
$$;
