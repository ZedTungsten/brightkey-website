-- Add show_total_to_installers column to installation_bookings
ALTER TABLE public.installation_bookings ADD COLUMN show_total_to_installers BOOLEAN DEFAULT TRUE;
