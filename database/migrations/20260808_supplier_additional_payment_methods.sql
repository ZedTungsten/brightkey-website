-- Allow each tenant-owned supplier to keep additional bank details and QR codes.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_payment_methods_is_array;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_payment_methods_is_array
  CHECK (jsonb_typeof(payment_methods) = 'array');

COMMENT ON COLUMN public.suppliers.payment_methods IS
  'Additional supplier payment entries. Each item is an info or qr record; ownership is inherited from the supplier company_id and protected by suppliers RLS.';
