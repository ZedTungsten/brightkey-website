CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_security_audit_company_created
  ON public.security_audit_log (company_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'security_audit_log'
      AND policyname = 'Tenant admins can read security audit log'
  ) THEN
    CREATE POLICY "Tenant admins can read security audit log"
      ON public.security_audit_log
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.companies AS company
          JOIN public.tenant_members AS member ON member.tenant_id = company.tenant_id
          WHERE company.id = security_audit_log.company_id
            AND member.user_id = (SELECT auth.uid())
            AND member.role IN ('owner', 'admin')
        )
      );
  END IF;
END
$$;
