-- Migration: Add Google Map Pin, Notes, and Multi-Installers Support to installation_bookings
-- Updates table schema to match frontend requirements.

ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS google_map_pin_url TEXT;
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS installers JSONB DEFAULT '[]'::JSONB;
