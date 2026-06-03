-- Migration 26: Add visibility toggle to global pricing_tiers
-- Adds is_visible boolean column to manage plan visibility on pricing pages

ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;
