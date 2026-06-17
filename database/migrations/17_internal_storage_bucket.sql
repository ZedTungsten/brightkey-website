-- =============================================================================
-- Migration 17: brightkey-internal Private Bucket + Fix brightkey-assets Policy
-- =============================================================================
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- ── 1. Create brightkey-internal as a PRIVATE bucket ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-internal',
  'brightkey-internal',
  false,       -- PRIVATE: no public read, requires signed URLs
  104857600,   -- 100 MB per file (supports CVs, PDFs, scanned IDs)
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. RLS: Authenticated upload to own company path in brightkey-internal ────
DROP POLICY IF EXISTS "Tenant upload to brightkey-internal" ON storage.objects;
CREATE POLICY "Tenant upload to brightkey-internal"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brightkey-internal'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 3. RLS: Authenticated can read (sign URLs) for own company files ──────────
--    SELECT on storage.objects is what allows createSignedUrl calls on private buckets.
DROP POLICY IF EXISTS "Tenant read own files from brightkey-internal" ON storage.objects;
CREATE POLICY "Tenant read own files from brightkey-internal"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brightkey-internal'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 4. RLS: Authenticated can delete own company files ───────────────────────
DROP POLICY IF EXISTS "Tenant delete from brightkey-internal" ON storage.objects;
CREATE POLICY "Tenant delete from brightkey-internal"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brightkey-internal'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 5. Fix brightkey-assets upload policy to enforce tenant path ──────────────
--    Previously: any authenticated user could upload ANYWHERE in the bucket.
--    Now: upload restricted to companies/{own_company_id}/* prefix.
DROP POLICY IF EXISTS "Auth upload brightkey-assets" ON storage.objects;
CREATE POLICY "Tenant upload to brightkey-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brightkey-assets'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 6. Fix brightkey-assets delete policy similarly ──────────────────────────
DROP POLICY IF EXISTS "Auth delete brightkey-assets" ON storage.objects;
CREATE POLICY "Tenant delete from brightkey-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brightkey-assets'
    AND (storage.foldername(name))[1] = 'companies'
    AND (storage.foldername(name))[2] IN (
      SELECT c.id::text FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
