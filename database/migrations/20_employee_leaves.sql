-- 20_employee_leaves.sql
-- Create table for managing leave requests

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  employee_id      UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  leave_type       VARCHAR(20) NOT NULL CHECK (leave_type IN ('sick', 'vacation')),
  date_from        DATE NOT NULL,
  date_to          DATE NOT NULL,
  number_of_days   NUMERIC(4, 1) NOT NULL,
  reason           TEXT NOT NULL,
  status           VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejected_reason  TEXT DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on leave_requests
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own leave requests
CREATE POLICY "Users can view their own leave requests" ON public.leave_requests
  FOR SELECT
  USING (
    auth.uid() = employee_id
  );

-- 2. Users can insert their own leave requests
CREATE POLICY "Users can submit their own leave requests" ON public.leave_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = employee_id
  );

-- 3. Managers/HR/Admin/Owner can view all leaves in the company
CREATE POLICY "Company-scoped leaves access" ON public.leave_requests
  FOR ALL USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );
