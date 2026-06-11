-- Add work_permit_image_url to installation_bookings table
ALTER TABLE public.installation_bookings ADD COLUMN IF NOT EXISTS work_permit_image_url TEXT;
