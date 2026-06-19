-- ============================================================
-- Migration: 30_add_delivered_fields_to_delivery_bookings.sql
-- Alters status check constraint and adds received_photo_url and delivered_at columns.
-- ============================================================

ALTER TABLE public.delivery_bookings
  DROP CONSTRAINT IF EXISTS delivery_bookings_status_check;

ALTER TABLE public.delivery_bookings
  ADD CONSTRAINT delivery_bookings_status_check CHECK (status IN ('booked', 'picked_up', 'delivered')),
  ADD COLUMN IF NOT EXISTS received_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
