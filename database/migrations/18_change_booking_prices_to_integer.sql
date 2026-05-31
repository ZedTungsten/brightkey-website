-- Migration: change booking prices to integer (stored in centavos)
-- Alter columns in public.installation_bookings table to maintain consistency with other price columns

ALTER TABLE public.installation_bookings
  ALTER COLUMN subtotal TYPE INTEGER USING (subtotal * 100)::INTEGER,
  ALTER COLUMN charges TYPE INTEGER USING (charges * 100)::INTEGER,
  ALTER COLUMN charges SET DEFAULT 0,
  ALTER COLUMN deductions TYPE INTEGER USING (deductions * 100)::INTEGER,
  ALTER COLUMN deductions SET DEFAULT 0,
  ALTER COLUMN grand_total TYPE INTEGER USING (grand_total * 100)::INTEGER,
  ALTER COLUMN deposit_amount TYPE INTEGER USING (deposit_amount * 100)::INTEGER,
  ALTER COLUMN balance_due TYPE INTEGER USING (balance_due * 100)::INTEGER;
