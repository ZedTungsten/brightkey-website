-- Migration: Add commissions_locked column to installation_bookings
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS commissions_locked BOOLEAN DEFAULT FALSE;
