-- ==========================================
-- Source: 06_storage_and_settings.sql
-- ==========================================

-- =============================================================================
-- BrightKey Consolidated Storage and Settings Schema (06_storage_and_settings.sql)
-- Consolidates global settings and storage buckets.
-- Run this in your Supabase SQL Editor.
-- =============================================================================

-- Drop tables if they exist
DROP TABLE IF EXISTS public.global_settings CASCADE;

-- ── 1. Global Settings Table ─────────────────────────────────────────────────
CREATE TABLE public.global_settings (
  key                 TEXT NOT NULL,
  company_id          UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  value               JSONB NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (key, company_id)
);

-- RLS Settings
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read for settings" ON public.global_settings 
  FOR SELECT USING (true);

CREATE POLICY "Allow company settings write" ON public.global_settings 
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 2. Supabase Storage Buckets ──────────────────────────────────────────────

-- A. review-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-media',
  'review-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png',
    'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policies for review-media
DROP POLICY IF EXISTS "Public read review-media" ON storage.objects;
CREATE POLICY "Public read review-media"
  ON storage.objects FOR SELECT USING (bucket_id = 'review-media');

DROP POLICY IF EXISTS "Auth upload review-media" ON storage.objects;
CREATE POLICY "Auth upload review-media"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'review-media');

DROP POLICY IF EXISTS "Auth delete review-media" ON storage.objects;
CREATE POLICY "Auth delete review-media"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'review-media');

-- B. brightkey-assets bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brightkey-assets',
  'brightkey-assets',
  true,
  52428800, -- 50MB limit
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policies for brightkey-assets
DROP POLICY IF EXISTS "Public read brightkey-assets" ON storage.objects;
CREATE POLICY "Public read brightkey-assets"
  ON storage.objects FOR SELECT USING (bucket_id = 'brightkey-assets');

DROP POLICY IF EXISTS "Auth upload brightkey-assets" ON storage.objects;
CREATE POLICY "Auth upload brightkey-assets"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brightkey-assets');

DROP POLICY IF EXISTS "Auth delete brightkey-assets" ON storage.objects;
CREATE POLICY "Auth delete brightkey-assets"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brightkey-assets');


-- ==========================================
-- Source: 44_storage_usage_functions.sql
-- ==========================================

-- Create helper function to calculate tenant storage usage
CREATE OR REPLACE FUNCTION public.get_all_tenants_storage_usage()
RETURNS TABLE (tenant_id UUID, company_id UUID, bytes_used BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.tenant_id,
    c.id AS company_id,
    COALESCE(
      (
        SELECT SUM((metadata->>'size')::BIGINT)
        FROM storage.objects
        WHERE bucket_id IN ('brightkey-assets', 'brightkey-internal')
          AND name LIKE 'companies/' || c.id || '/%'
      ), 
      0
    )::BIGINT AS bytes_used
  FROM public.companies c;
END;
$$;
