-- Migration 12: Fix "permission denied for table users" error in company_invitations RLS
-- The policy "Allow user to read their invitations" from migration 09 queries auth.users
-- directly, which is not permitted from RLS context. Replace with auth.email() instead.

DROP POLICY IF EXISTS "Allow user to read their invitations" ON public.company_invitations;

-- Use auth.email() which safely returns the current user's email without
-- requiring direct access to the restricted auth.users table.
CREATE POLICY "Allow user to read their invitations"
  ON public.company_invitations FOR SELECT
  USING (
    email = auth.email()
  );
