-- =============================================================================
-- BrightKey Ecommerce Schema Update (v3)
-- Run this in your Supabase SQL Editor to update the existing reviews table
-- with columns for customer images and admin replies.
-- =============================================================================

ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS admin_reply text;
