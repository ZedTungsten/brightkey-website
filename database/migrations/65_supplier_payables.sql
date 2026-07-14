-- Migration: 65_supplier_payables.sql
-- Create table to track supplier payables (Accounts Payable)

CREATE TABLE IF NOT EXISTS public.supplier_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  amount_cents INTEGER NOT NULL, -- payable amount in centavos
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid, paid, void
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;

-- Create policies conditionally to prevent execution crashes when rerun
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members read payables'
  ) THEN
    CREATE POLICY "Allow company members read payables" ON public.supplier_payables
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
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members insert payables'
  ) THEN
    CREATE POLICY "Allow company members insert payables" ON public.supplier_payables
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
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members update payables'
  ) THEN
    CREATE POLICY "Allow company members update payables" ON public.supplier_payables
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
    WHERE tablename = 'supplier_payables' 
      AND policyname = 'Allow company members delete payables'
  ) THEN
    CREATE POLICY "Allow company members delete payables" ON public.supplier_payables
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
