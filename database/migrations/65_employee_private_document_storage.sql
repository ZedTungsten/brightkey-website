-- Permit authenticated HR members to upload and read private employee
-- documents only within their own company-scoped employee folder.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'HR can upload company employee documents'
  ) THEN
    CREATE POLICY "HR can upload company employee documents"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'brightkey-internal'
        AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/employees/'
        AND public.has_module_access(
          (SELECT auth.uid()),
          ((storage.foldername(name))[2])::UUID,
          'HR'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'HR can read company employee documents'
  ) THEN
    CREATE POLICY "HR can read company employee documents"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'brightkey-internal'
        AND name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/employees/'
        AND public.has_module_access(
          (SELECT auth.uid()),
          ((storage.foldername(name))[2])::UUID,
          'HR'
        )
      );
  END IF;
END
$$;
