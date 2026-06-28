-- =============================================================================
-- BrightKey Employee Adjustments & Reimbursements Tables
-- Consolidates adjustments and reimbursements with multi-tenant RLS.
-- =============================================================================

-- Drop tables if they exist
DROP TABLE IF EXISTS public.employee_adjustments CASCADE;
DROP TABLE IF EXISTS public.employee_reimbursements CASCADE;

-- Create employee_adjustments table
CREATE TABLE public.employee_adjustments (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  date           DATE NOT NULL,
  label          TEXT NOT NULL,
  client_id      TEXT,
  paid           BOOLEAN DEFAULT false NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Create employee_reimbursements table
CREATE TABLE public.employee_reimbursements (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  date           DATE NOT NULL,
  label          TEXT NOT NULL,
  client_id      TEXT,
  paid           BOOLEAN DEFAULT false NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_employee_adjustments_company ON public.employee_adjustments(company_id);
CREATE INDEX idx_employee_adjustments_employee ON public.employee_adjustments(employee_id);
CREATE INDEX idx_employee_reimbursements_company ON public.employee_reimbursements(company_id);
CREATE INDEX idx_employee_reimbursements_employee ON public.employee_reimbursements(employee_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.employee_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_reimbursements ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for employee_adjustments
CREATE POLICY "Allow company members read adjustments" ON public.employee_adjustments
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert adjustments" ON public.employee_adjustments
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update adjustments" ON public.employee_adjustments
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete adjustments" ON public.employee_adjustments
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Create RLS Policies for employee_reimbursements
CREATE POLICY "Allow company members read reimbursements" ON public.employee_reimbursements
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert reimbursements" ON public.employee_reimbursements
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update reimbursements" ON public.employee_reimbursements
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete reimbursements" ON public.employee_reimbursements
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
