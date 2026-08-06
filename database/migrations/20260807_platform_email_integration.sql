CREATE TABLE IF NOT EXISTS public.platform_email_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider = 'resend'),
  sender_name TEXT,
  api_key TEXT,
  integration_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider)
);

ALTER TABLE public.platform_email_integrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_email_integrations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_email_integrations TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_email_integrations'
      AND policyname = 'Platform owner manages tenant signup email'
  ) THEN
    CREATE POLICY "Platform owner manages tenant signup email"
      ON public.platform_email_integrations
      FOR ALL TO authenticated
      USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com')
      WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'johnzeustaller@gmail.com');
  END IF;
END $$;

COMMENT ON TABLE public.platform_email_integrations IS
  'Platform-owner Resend credentials used only for newly subscribed tenant account invitations.';
