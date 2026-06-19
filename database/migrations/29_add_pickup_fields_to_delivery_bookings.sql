-- ============================================================
-- Migration: 29_add_pickup_fields_to_delivery_bookings.sql
-- Adds status, pickup_photos, and picked_up_at columns to delivery_bookings.
-- ============================================================

ALTER TABLE public.delivery_bookings
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'picked_up')),
  ADD COLUMN IF NOT EXISTS pickup_photos TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
