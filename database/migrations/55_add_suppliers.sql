-- Create Suppliers Table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.tenant_businesses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  street_address TEXT,
  city TEXT,
  province TEXT,
  contact_number TEXT,
  contact_number_2 TEXT,
  email TEXT,
  email_2 TEXT,
  website TEXT,
  tin TEXT,
  payment_account_name TEXT,
  payment_account_number TEXT,
  qr_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow manage suppliers" ON public.suppliers;

-- Create Policies
CREATE POLICY "Allow select suppliers" ON public.suppliers
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow manage suppliers" ON public.suppliers
  FOR ALL USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );
