DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_contract_signatures'
      AND policyname = 'HR can invalidate changed company contract signatures'
  ) THEN
    CREATE POLICY "HR can invalidate changed company contract signatures"
      ON public.employee_contract_signatures
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.companies company
          JOIN public.tenant_members member
            ON member.tenant_id = company.tenant_id
          WHERE company.id = employee_contract_signatures.company_id
            AND member.user_id = (SELECT auth.uid())
            AND (
              lower(coalesce(member.role, '')) IN ('owner', 'admin', 'tenant owner', 'hr')
              OR EXISTS (
                SELECT 1
                FROM unnest(coalesce(member.accessible_modules, ARRAY[]::TEXT[])) module_name
                WHERE lower(module_name) = 'hr'
              )
            )
        )
      );
  END IF;
END
$$;
