-- Migration to add needs_work_permit column to installation_bookings
ALTER TABLE public.installation_bookings
ADD COLUMN needs_work_permit BOOLEAN DEFAULT false;
