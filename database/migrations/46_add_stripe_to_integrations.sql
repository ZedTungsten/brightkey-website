-- Migration 46: Add Stripe public and secret key columns to company_integrations
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS stripe_public_key TEXT;
ALTER TABLE public.company_integrations ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT;

-- Create a secure public view that only reveals public keys and configuration indicators (excludes secret keys)
CREATE OR REPLACE VIEW public.view_public_integrations AS
SELECT 
  company_id, 
  (paymongo_public_key IS NOT NULL AND paymongo_secret_key IS NOT NULL) AS paymongo_configured, 
  (stripe_public_key IS NOT NULL AND stripe_secret_key IS NOT NULL) AS stripe_configured,
  paymongo_public_key,
  stripe_public_key
FROM public.company_integrations;

-- Grant select permission on the view to public/anon and authenticated roles
GRANT SELECT ON public.view_public_integrations TO anon, authenticated;
