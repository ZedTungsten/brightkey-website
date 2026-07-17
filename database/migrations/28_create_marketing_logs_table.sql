-- Migration 28: Create marketing_logs table for Marketing Logs Tracker
CREATE TABLE IF NOT EXISTS public.marketing_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  item         TEXT NOT NULL,
  change_desc  TEXT NOT NULL,
  employee_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL,
  learning     TEXT NOT NULL,
  starred      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.marketing_logs ENABLE ROW LEVEL SECURITY;

-- Select policy based on company context
CREATE POLICY "Allow company members select marketing_logs" ON public.marketing_logs
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Write policy
CREATE POLICY "Allow company members write marketing_logs" ON public.marketing_logs
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
