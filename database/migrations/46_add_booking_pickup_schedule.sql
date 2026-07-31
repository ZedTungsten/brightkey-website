-- Optional delivery/pickup schedule attached to an installation order.
-- Nullable by design so existing and installation-only bookings remain valid.
ALTER TABLE public.installation_bookings
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS pickup_time TEXT,
  ADD COLUMN IF NOT EXISTS pickup_notes TEXT;

COMMENT ON COLUMN public.installation_bookings.pickup_date
  IS 'Optional customer pickup or installer delivery date.';
COMMENT ON COLUMN public.installation_bookings.pickup_time
  IS 'Optional preferred pickup/delivery time window (Morning or Afternoon).';
COMMENT ON COLUMN public.installation_bookings.pickup_notes
  IS 'Optional customer pickup or installer delivery instructions.';
