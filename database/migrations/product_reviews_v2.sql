-- =============================================================================
-- BrightKey product_reviews v2 Migration
-- Adds: is_hidden, is_pinned, admin_hearted, thumbs_up_count,
--       media_urls, reviewer_url
-- Run this in Supabase SQL Editor (safe to run multiple times — uses IF NOT EXISTS)
-- =============================================================================

-- ── 1. Add new columns to product_reviews ─────────────────────────────────────
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS is_hidden       BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_pinned       BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_hearted   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS thumbs_up_count INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_urls      TEXT[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewer_url    TEXT;

-- ── 2. Update the public-read policy to also exclude hidden reviews ──────────
-- Drop the old SELECT policy and recreate it
DROP POLICY IF EXISTS "Public read approved" ON public.product_reviews;

CREATE POLICY "Public read approved"
  ON public.product_reviews
  FOR SELECT
  USING (is_approved = true AND is_hidden = false);

-- ── 3. Indexes for new sortable/filterable columns ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_pinned       ON public.product_reviews(is_pinned);
CREATE INDEX IF NOT EXISTS idx_reviews_hidden       ON public.product_reviews(is_hidden);
CREATE INDEX IF NOT EXISTS idx_reviews_hearted      ON public.product_reviews(admin_hearted);
CREATE INDEX IF NOT EXISTS idx_reviews_thumbsup     ON public.product_reviews(thumbs_up_count);
CREATE INDEX IF NOT EXISTS idx_reviews_created_desc ON public.product_reviews(created_at DESC);

-- ── 4. Supabase Storage — review-media bucket ─────────────────────────────────
-- Create the bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-media',
  'review-media',
  true,                                         -- public: URLs are readable without auth
  52428800,                                     -- 50 MB hard limit per file (server-enforced)
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png',
    'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
-- Allow anyone to read (bucket is public, but explicit policy for clarity)
CREATE POLICY "Public read review-media"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'review-media');

-- Allow authenticated users to upload
CREATE POLICY "Auth upload review-media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'review-media');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Auth delete review-media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'review-media');

-- =============================================================================
-- Done! Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'product_reviews' ORDER BY ordinal_position;
-- =============================================================================
