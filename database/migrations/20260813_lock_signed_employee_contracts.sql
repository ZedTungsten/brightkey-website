DROP POLICY IF EXISTS "Employees manage own contract signature"
  ON public.employee_contract_signatures;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'Employees read own contract signature'
  ) THEN
    CREATE POLICY "Employees read own contract signature"
      ON public.employee_contract_signatures
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.employees employee
          WHERE employee.id = employee_contract_signatures.employee_id
            AND employee.company_id = employee_contract_signatures.company_id
            AND lower(employee.email) = lower(auth.jwt()->>'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'Employees sign own contract once'
  ) THEN
    CREATE POLICY "Employees sign own contract once"
      ON public.employee_contract_signatures
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.employees employee
          WHERE employee.id = employee_contract_signatures.employee_id
            AND employee.company_id = employee_contract_signatures.company_id
            AND lower(employee.email) = lower(auth.jwt()->>'email')
        )
      );
  END IF;
END
$$;
