CREATE TABLE IF NOT EXISTS public.employee_contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  signature_data_url TEXT NOT NULL CHECK (signature_data_url ~ '^data:image/png;base64,'),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_id, job_post_id)
);

ALTER TABLE public.employee_contract_signatures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_contract_signatures' AND policyname = 'Employees manage own contract signature') THEN
    CREATE POLICY "Employees manage own contract signature" ON public.employee_contract_signatures
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.employees employee WHERE employee.id = employee_contract_signatures.employee_id AND employee.company_id = employee_contract_signatures.company_id AND lower(employee.email) = lower(auth.jwt()->>'email'))
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.employees employee WHERE employee.id = employee_contract_signatures.employee_id AND employee.company_id = employee_contract_signatures.company_id AND lower(employee.email) = lower(auth.jwt()->>'email'))
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS employee_contract_signatures_company_employee_idx
  ON public.employee_contract_signatures (company_id, employee_id, job_post_id);
