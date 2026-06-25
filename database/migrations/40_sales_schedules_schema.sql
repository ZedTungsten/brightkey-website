-- Migration 40: Create sales_schedules table
-- Stores weekly repeating schedule blocks for Sales employees.
-- Each row represents: an employee works on day_of_week from hour_start to hour_end.
-- day_of_week follows JS convention: 0=Sun, 1=Mon, 2=Tue … 6=Sat.

CREATE TABLE IF NOT EXISTS public.sales_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_start   SMALLINT NOT NULL CHECK (hour_start BETWEEN 0 AND 23),
  hour_end     SMALLINT NOT NULL CHECK (hour_end   BETWEEN 1 AND 24),
  color        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hour_range_valid CHECK (hour_end > hour_start)
);

-- Index for fast per-company lookups
CREATE INDEX IF NOT EXISTS idx_sales_schedules_company
  ON public.sales_schedules (company_id);

CREATE INDEX IF NOT EXISTS idx_sales_schedules_employee
  ON public.sales_schedules (company_id, employee_id);

-- ── Row-Level Security ──
ALTER TABLE public.sales_schedules ENABLE ROW LEVEL SECURITY;

-- Members of the company may read schedules
DROP POLICY IF EXISTS "Allow company members read sales_schedules" ON public.sales_schedules;
CREATE POLICY "Allow company members read sales_schedules" ON public.sales_schedules
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Members of the company may insert/update/delete their company's schedules
DROP POLICY IF EXISTS "Allow company members write sales_schedules" ON public.sales_schedules;
CREATE POLICY "Allow company members write sales_schedules" ON public.sales_schedules
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
