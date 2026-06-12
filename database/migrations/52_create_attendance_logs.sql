-- Migration 52: Create attendance_logs table for tracking employee statuses.

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  status       VARCHAR(20) NOT NULL CHECK (status IN ('available', 'break', 'offline')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Company attendance logs access" ON public.attendance_logs;

-- Scoped access policies
CREATE POLICY "Company attendance logs access" ON public.attendance_logs
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );
