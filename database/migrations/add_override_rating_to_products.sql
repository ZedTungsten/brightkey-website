-- Migration: Add override_rating column to public.products
-- This column determines whether display_rating and display_reviews_count manual values should take precedence over actual dynamic reviews.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS override_rating BOOLEAN NOT NULL DEFAULT FALSE;
