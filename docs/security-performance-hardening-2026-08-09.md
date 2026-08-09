# Security and Performance Hardening — 2026-08-09

## Compatibility requirements

These changes preserve existing application behavior and data contracts:

- Authenticated members retain company-wide access to the same General Journal, settings, and integration records. No department, employee-self, active-only, or pagination authorization rule was added.
- Existing database table names, columns, setting keys, account labels, product IDs/SKUs, order fields, and payment-provider connections remain unchanged.
- Public storefront access remains available for the settings it already needs: `free_shipping`, `free_gifts`, `upsell_cross_sell`, `delivery_lead_time`, `promo_popup`, and `invoice_template`.
- Checkout continues to support variants, configured upsell price adjustments, coupons, free-shipping rules, shipping zones, PayMongo, and Stripe.
- Database changes are non-destructive and rerunnable. No table or user data is dropped or rewritten.

## Applied security fixes

1. Legacy unrestricted `public_all` / `Allow all write for settings` policies were removed. `global_settings` anonymous reads are limited to the storefront allowlist. All authenticated tenant members retain access to every setting owned by their company.
2. `company_integrations` now has tenant-member RLS. The public integration view exposes only public keys and provider-configured flags; secret keys are not included.
3. `general_journal` now has tenant-member RLS. Anonymous and cross-tenant reads and writes are denied while authenticated same-tenant workflows remain available.
4. PayMongo and Stripe checkout totals are rebuilt server-side from company-scoped products, shipping configuration, coupons, free-shipping rules, and configured upsell prices. Browser-supplied totals are no longer authoritative.
5. PayMongo webhook order data is signed by the checkout server and verified before an order is recorded. The webhook uses a service-role key and verifies the provider signature against the raw request body.
6. The organization logo is created through safe DOM property assignment after URL-protocol validation instead of injecting a database value into `innerHTML`.
7. Public cart and checkout settings, shipping zones, shipping areas, and coupons are explicitly scoped by `company_id`.
8. Production dependency advisories were cleared by updating Nodemailer and pinning Cheerio's Undici dependency to a patched compatible release.

## Applied performance fix

General Journal totals and row counts now use `get_general_journal_summary`. The database calculates the aggregates using the same company, date, month, account, search, and snapshot filters as the visible table. The browser no longer downloads up to 50,000 debit/credit rows before fetching the current page.

## Required deployment checks

- Apply `database/migrations/20260809_security_and_query_hardening.sql` through the signed-in Supabase SQL Editor.
- Confirm an anonymous request cannot read `general_journal` or non-storefront `global_settings` keys.
- Confirm an authenticated regular tenant member and an owner/admin can load and edit their existing permitted journal/settings workflows.
- Confirm a second tenant cannot read or mutate the first tenant's journal, settings, or integrations.
- Run a PayMongo and Stripe test checkout with a regular item, a variant, an upsell-adjusted item, a coupon, paid shipping, and free shipping.
- Confirm the PayMongo webhook creates the order and item rows with the original IDs, SKUs, quantities, labels, and centavo amounts.
- Run `npm run preflight` and `npm audit --omit=dev`.
