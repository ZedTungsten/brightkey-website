CREATE TABLE IF NOT EXISTS public.platform_payment_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('paymongo', 'stripe')),
  public_key TEXT,
  secret_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider)
);

ALTER TABLE public.platform_payment_integrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_payment_integrations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_payment_integrations TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_payment_integrations'
      AND policyname = 'Platform owner manages subscription payments'
  ) THEN
    CREATE POLICY "Platform owner manages subscription payments"
      ON public.platform_payment_integrations
      FOR ALL TO authenticated
      USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com')
      WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com');
  END IF;
END $$;

COMMENT ON TABLE public.platform_payment_integrations IS
  'Platform-owner credentials used only for BrightKey tenant plan subscription payments.';
