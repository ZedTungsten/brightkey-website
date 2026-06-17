-- =============================================================================
-- Migration 22: Employee Chats & Presence View
-- =============================================================================

-- Create employee_chats table
CREATE TABLE IF NOT EXISTS public.employee_chats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sender_id    UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  receiver_id  UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.employee_chats ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow authenticated users to select chats they sent or received, scoped to company tenancy
CREATE POLICY "Allow members read company chats" ON public.employee_chats
  FOR SELECT TO authenticated
  USING (
    (sender_id = auth.uid() OR receiver_id = auth.uid())
    AND company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Insert policy: Allow authenticated users to send chats, matching auth.uid() as sender, scoped to company tenancy
CREATE POLICY "Allow members insert chats" ON public.employee_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND company_id IN (
      SELECT id FROM public.companies
      WHERE tenant_id IN (SELECT public.get_user_tenants(auth.uid()))
    )
  );

-- Create employee_presence view (security invoker to respect attendance_logs policies)
CREATE OR REPLACE VIEW public.employee_presence
WITH (security_invoker = true) AS
SELECT DISTINCT ON (employee_id)
  employee_id,
  status,
  created_at
FROM public.attendance_logs
ORDER BY employee_id, created_at DESC;
