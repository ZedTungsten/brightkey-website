-- Authoritative tenant owners may manage features for businesses belonging to
-- their company even when no duplicate tenant_members row exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_features'
      AND policyname = 'Tenant owners manage business features'
  ) THEN
    CREATE POLICY "Tenant owners manage business features"
      ON public.business_features
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.tenant_businesses AS business
          WHERE business.id = business_features.business_id
            AND public.is_company_owner(business.company_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.tenant_businesses AS business
          WHERE business.id = business_features.business_id
            AND public.is_company_owner(business.company_id)
        )
      );
  END IF;
END
$$;
