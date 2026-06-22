-- =============================================================================
-- Fix view_public_integrations Security Invoker Property (33_fix_view_public_integrations_security_invoker.sql)
-- Configures the view with security_invoker = true so PostgreSQL respects Row-Level
-- Security (RLS) policies of the querying user instead of the view creator.
-- =============================================================================

DROP VIEW IF EXISTS public.view_public_integrations CASCADE;

CREATE OR REPLACE VIEW public.view_public_integrations 
WITH (security_invoker = true) 
AS
SELECT 
  company_id, 
  (paymongo_public_key IS NOT NULL AND paymongo_secret_key IS NOT NULL) AS paymongo_configured, 
  (stripe_public_key IS NOT NULL AND stripe_secret_key IS NOT NULL) AS stripe_configured,
  paymongo_public_key,
  stripe_public_key
FROM public.company_integrations;

GRANT SELECT ON public.view_public_integrations TO anon, authenticated;
