-- Preserve the existing customer_phone field as Contact Number 1 and add an
-- optional second number for booking and calendar workflows.

ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS customer_phone_2 TEXT;

ALTER TABLE public.installation_bookings
  DROP CONSTRAINT IF EXISTS installation_bookings_customer_phone_2_digits;

ALTER TABLE public.installation_bookings
  ADD CONSTRAINT installation_bookings_customer_phone_2_digits
    CHECK (customer_phone_2 IS NULL OR customer_phone_2 ~ '^[0-9]+$') NOT VALID;
