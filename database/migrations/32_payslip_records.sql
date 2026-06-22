-- =============================================================================
-- BrightKey Payslip Records Table (32_payslip_records.sql)
-- Stores snapshots of employee department, position, salary, and earnings
-- when their payslips are finalized to prevent retrospective updates.
-- =============================================================================

DROP TABLE IF EXISTS public.payslip_records CASCADE;

CREATE TABLE public.payslip_records (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  payout_month        TEXT NOT NULL, -- Format: YYYY-MM
  
  -- Snapshotted Career/Payment Information
  department          TEXT,
  position            TEXT,
  salary              NUMERIC(12, 2) NOT NULL,
  
  -- Snapshotted Computed Payout Summary
  basic_paid          NUMERIC(12, 2) NOT NULL,
  commissions         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adjustments         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reimbursements      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  special_payouts     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_payout        NUMERIC(12, 2) NOT NULL,
  
  -- Detailed lists stored as JSONB for accurate historical breakdown rendering
  adjustments_list    JSONB DEFAULT '[]'::jsonb,
  reimbursements_list JSONB DEFAULT '[]'::jsonb,
  commission_details  JSONB DEFAULT '[]'::jsonb,
  special_schedules   JSONB DEFAULT '[]'::jsonb,
  
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_employee_month UNIQUE (employee_id, payout_month)
);

-- Indexing for performance
CREATE INDEX idx_payslip_records_company ON public.payslip_records(company_id);
CREATE INDEX idx_payslip_records_employee ON public.payslip_records(employee_id);
CREATE INDEX idx_payslip_records_employee_month ON public.payslip_records(employee_id, payout_month);

-- Enable Row Level Security (RLS)
ALTER TABLE public.payslip_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow company members read payslip records" ON public.payslip_records
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert payslip records" ON public.payslip_records
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update payslip records" ON public.payslip_records
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete payslip records" ON public.payslip_records
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
