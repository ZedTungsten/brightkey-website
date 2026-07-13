-- Migration: 63_locked_profit_loss_statements.sql
-- Create table to cache computed Profit & Loss statements for locked months

CREATE TABLE IF NOT EXISTS public.locked_profit_loss_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  statement_data JSONB NOT NULL, -- Stores all computed P&L values
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT locked_pl_company_month_unique UNIQUE (company_id, month)
);

-- Enable Row-Level Security
ALTER TABLE public.locked_profit_loss_statements ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist to prevent crashes on rerun
DROP POLICY IF EXISTS "Allow company members read locked statements" ON public.locked_profit_loss_statements;
DROP POLICY IF EXISTS "Allow company members insert locked statements" ON public.locked_profit_loss_statements;
DROP POLICY IF EXISTS "Allow company members update locked statements" ON public.locked_profit_loss_statements;
DROP POLICY IF EXISTS "Allow company members delete locked statements" ON public.locked_profit_loss_statements;

-- Create policies for tenant members
CREATE POLICY "Allow company members read locked statements" ON public.locked_profit_loss_statements
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert locked statements" ON public.locked_profit_loss_statements
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update locked statements" ON public.locked_profit_loss_statements
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete locked statements" ON public.locked_profit_loss_statements
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
