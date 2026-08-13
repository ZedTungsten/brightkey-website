-- The platform-owner deletion API must list and remove every company-scoped
-- object through the Storage API before deleting the tenant database rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Platform owner can list tenant storage'
  ) THEN
    CREATE POLICY "Platform owner can list tenant storage"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id IN ('brightkey-assets', 'brightkey-internal')
        AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Platform owner can delete tenant storage'
  ) THEN
    CREATE POLICY "Platform owner can delete tenant storage"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id IN ('brightkey-assets', 'brightkey-internal')
        AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com'
      );
  END IF;
END $$;
