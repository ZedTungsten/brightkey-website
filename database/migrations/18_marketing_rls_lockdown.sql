-- =============================================================================
-- Migration 18: Lock Down Marketing Audience RLS
-- =============================================================================
-- Removes public SELECT/UPDATE that exposed customer PII (email, phone, address)
-- to any unauthenticated user. Replaces with company-scoped authenticated access.
--
-- Public INSERT is preserved (needed: promo popup, product pages, checkout).
-- Public SELECT on email_marketing_audiences is preserved (no PII; needed for
-- anon audience name lookups on product pages and checkout).
-- =============================================================================

-- ── 1. marketing_audience — drop the three dangerous public/over-broad policies ─
DROP POLICY IF EXISTS "Allow public update"          ON public.marketing_audience;
DROP POLICY IF EXISTS "Allow public select"          ON public.marketing_audience;
DROP POLICY IF EXISTS "Allow authenticated read/write" ON public.marketing_audience;

-- Staff SELECT: own company rows, plus legacy rows where company_id was not set
-- (legacy rows have company_id = NULL because public product-page inserts omit it).
DROP POLICY IF EXISTS "Staff read own company marketing_audience" ON public.marketing_audience;
CREATE POLICY "Staff read own company marketing_audience"
  ON public.marketing_audience FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
    OR company_id IS NULL   -- Legacy unscoped records visible to any authenticated staff
  );

-- Staff UPDATE: own company rows only
DROP POLICY IF EXISTS "Staff update own company marketing_audience" ON public.marketing_audience;
CREATE POLICY "Staff update own company marketing_audience"
  ON public.marketing_audience FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Staff DELETE: own company rows only
DROP POLICY IF EXISTS "Staff delete own company marketing_audience" ON public.marketing_audience;
CREATE POLICY "Staff delete own company marketing_audience"
  ON public.marketing_audience FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 2. email_marketing_audiences — allow public SELECT (no PII in this table) ──
-- Anon product pages must SELECT by name to resolve the audience_id before
-- inserting a member. The table only contains: id, company_id, name, description.
DROP POLICY IF EXISTS "Allow company audience select" ON public.email_marketing_audiences;
CREATE POLICY "Public select email_marketing_audiences"
  ON public.email_marketing_audiences FOR SELECT
  USING (true);   -- Safe: no PII columns; name/description only

-- Keep existing company-scoped write policy (already correct)

-- ── 3. email_marketing_audience_members — drop public SELECT/UPDATE ───────────
DROP POLICY IF EXISTS "Allow public update on members"  ON public.email_marketing_audience_members;
DROP POLICY IF EXISTS "Allow public select on members"  ON public.email_marketing_audience_members;

-- Replace the over-broad "Company staff audience members access" (used get_user_tenants())
DROP POLICY IF EXISTS "Company staff audience members access" ON public.email_marketing_audience_members;

-- Staff SELECT: match on company_id OR via the parent audience's company_id
-- (anon inserts often omit company_id, so the audience_id join catches those rows)
DROP POLICY IF EXISTS "Staff read audience members" ON public.email_marketing_audience_members;
CREATE POLICY "Staff read audience members"
  ON public.email_marketing_audience_members FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
    OR audience_id IN (
      SELECT a.id FROM public.email_marketing_audiences a
      WHERE a.company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
      )
    )
  );

-- Staff ALL (update/delete/select again for completeness): same scoping
DROP POLICY IF EXISTS "Staff manage audience members" ON public.email_marketing_audience_members;
CREATE POLICY "Staff manage audience members"
  ON public.email_marketing_audience_members FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
    )
    OR audience_id IN (
      SELECT a.id FROM public.email_marketing_audiences a
      WHERE a.company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
      )
    )
  );

-- =============================================================================
-- NOTE: Product page inserts (INSERT into marketing_audience/members via anon)
-- do not pass company_id. These records land with company_id = NULL.
-- For future tightening: update product-preview.html template to inject
-- companyId on promo popup signups, then run npm run build.
-- =============================================================================
