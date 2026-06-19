-- =============================================================================
-- BrightKey Commission Assignments Table (30_commission_assignments.sql)
-- Consolidates per-booking item sales commissions and provides multi-tenant RLS.
-- =============================================================================

-- Drop table if it exists
DROP TABLE IF EXISTS public.commission_assignments CASCADE;

-- Create commission_assignments table
CREATE TABLE public.commission_assignments (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  booking_id     UUID REFERENCES public.installation_bookings(id) ON DELETE CASCADE NOT NULL,
  sku            TEXT NOT NULL,
  product_index  INTEGER DEFAULT 0 NOT NULL,
  employee_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  rate_label     TEXT NOT NULL, -- e.g., 'Agent', 'Lead', 'Coordinator'
  percent        NUMERIC(5,2) NOT NULL, -- e.g., 2.50
  amount         INTEGER NOT NULL, -- Amount in centavos (PHP amount * 100)
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent assigning the same employee to the same role/SKU/index on a booking twice
  CONSTRAINT unique_booking_sku_index_employee_role UNIQUE (booking_id, sku, product_index, employee_id, rate_label)
);

-- Indexing for fast queries during payroll & reports
CREATE INDEX idx_commission_assignments_company ON public.commission_assignments(company_id);
CREATE INDEX idx_commission_assignments_employee ON public.commission_assignments(employee_id);
CREATE INDEX idx_commission_assignments_booking ON public.commission_assignments(booking_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.commission_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Allow company members read commissions" ON public.commission_assignments
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members insert commissions" ON public.commission_assignments
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members update commissions" ON public.commission_assignments
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow company members delete commissions" ON public.commission_assignments
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
