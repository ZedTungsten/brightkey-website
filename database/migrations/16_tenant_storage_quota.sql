-- =============================================================================
-- Migration 16: Tenant Storage Quota + Review Storage Consolidation
-- =============================================================================
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- ── 1. Add storage_limit_mb to tenants (default 5 GB = 5120 MB) ──────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS storage_limit_mb INTEGER NOT NULL DEFAULT 5120;

COMMENT ON COLUMN public.tenants.storage_limit_mb IS
  'Application-level storage quota in MB for all content under brightkey-assets/companies/{company_id}/. Default 5 GB (5120 MB). Enforced at upload time by checking storage.objects sizes.';

-- ── 2. RLS: Allow owners to update their own tenant row ───────────────────────
DROP POLICY IF EXISTS "Allow owner update own tenant" ON public.tenants;
CREATE POLICY "Allow owner update own tenant" ON public.tenants
  FOR UPDATE USING (
    id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ── 3. Allow anonymous uploads to brightkey-assets under companies/*/reviews/ ─
--    (smartlock-calendar.html uses anon key for installer uploads)
DROP POLICY IF EXISTS "Anon upload reviews to brightkey-assets" ON storage.objects;
CREATE POLICY "Anon upload reviews to brightkey-assets"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'brightkey-assets'
    AND name LIKE 'companies/%/reviews/%'
  );

-- ── 4. Clean all existing product_reviews records (fresh start) ───────────────
DELETE FROM public.product_reviews;

-- ── 5. Deprecate review-media bucket policies ─────────────────────────────────
--    Storage files must be deleted manually via Supabase UI (Storage > review-media > Select All > Delete)
--    or via the Supabase Storage API. SQL cannot delete storage objects directly.
DROP POLICY IF EXISTS "Public read review-media" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload review-media" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete review-media" ON storage.objects;

-- Note: The review-media bucket itself is left in place but all policies are dropped.
-- You may delete remaining files from it via Supabase Dashboard > Storage > review-media.
