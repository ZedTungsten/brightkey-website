-- Migration: 64_finance_adjustments_payables_receivables.sql
-- Consolidated tracking tables for Supplier Cost Adjustments, Supplier Payables (Accounts Payable), Company Receivables, and Receivable Payments

-- 1. Create supplier_cost_adjustments table
CREATE TABLE IF NOT EXISTS public.supplier_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, -- positive or negative value in centavos
  adjustment_date DATE NOT NULL, -- date the adjustment belongs to (for monthly scope)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create supplier_payables table
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

-- 3. Create company_receivables table
CREATE TABLE IF NOT EXISTS public.company_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('owner', 'staff', 'supplier')),
  party_name TEXT NOT NULL,
  reference_no TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  grand_total_cents INTEGER NOT NULL,
  balance_due_cents INTEGER NOT NULL,
  contact_number TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'overdue', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create receivable_payments table
CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.installation_bookings(id) ON DELETE CASCADE,
  receivable_id UUID REFERENCES public.company_receivables(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.supplier_cost_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;

-- Conditional policies for supplier_cost_adjustments
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

-- Conditional policies for supplier_payables
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

-- Conditional policies for company_receivables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members read company_receivables'
  ) THEN
    CREATE POLICY "Allow company members read company_receivables" ON public.company_receivables
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
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members insert company_receivables'
  ) THEN
    CREATE POLICY "Allow company members insert company_receivables" ON public.company_receivables
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
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members update company_receivables'
  ) THEN
    CREATE POLICY "Allow company members update company_receivables" ON public.company_receivables
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
    WHERE tablename = 'company_receivables' 
      AND policyname = 'Allow company members delete company_receivables'
  ) THEN
    CREATE POLICY "Allow company members delete company_receivables" ON public.company_receivables
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

-- Conditional policies for receivable_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members read payments'
  ) THEN
    CREATE POLICY "Allow company members read payments" ON public.receivable_payments
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
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members insert payments'
  ) THEN
    CREATE POLICY "Allow company members insert payments" ON public.receivable_payments
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
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members update payments'
  ) THEN
    CREATE POLICY "Allow company members update payments" ON public.receivable_payments
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
    WHERE tablename = 'receivable_payments' 
      AND policyname = 'Allow company members delete payments'
  ) THEN
    CREATE POLICY "Allow company members delete payments" ON public.receivable_payments
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
