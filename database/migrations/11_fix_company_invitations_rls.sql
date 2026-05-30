-- Migration 11: Fix company_invitations RLS SELECT policy
-- The original policy using is_tenant_admin() can fail if there is an RLS
-- recursion issue or if the function is not found. This replaces it with
-- a direct, reliable inline check.

-- Drop and recreate the manage policy with explicit per-operation policies
DROP POLICY IF EXISTS "Allow tenant admin manage invitations" ON public.company_invitations;

-- SELECT: owner/admin of the tenant can read all invitations for their tenant
CREATE POLICY "Allow tenant admin select invitations"
  ON public.company_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

-- INSERT: owner/admin can create invitations
CREATE POLICY "Allow tenant admin insert invitations"
  ON public.company_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );

-- DELETE: owner/admin can cancel invitations
CREATE POLICY "Allow tenant admin delete invitations"
  ON public.company_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = company_invitations.tenant_id
        AND tm.role IN ('owner', 'admin')
    )
  );
