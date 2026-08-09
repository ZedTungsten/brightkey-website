import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getBearerToken,
  isAllowedRedirectUrl,
  setApiCors
} from '../lib/api/security.js';
import { signCheckoutPayload, verifyCheckoutPayload } from '../lib/api/checkout-pricing.js';

test('bearer tokens are parsed strictly', () => {
  assert.equal(getBearerToken({ headers: { authorization: 'Bearer token-value' } }), 'token-value');
  assert.equal(getBearerToken({ headers: { authorization: 'Basic token-value' } }), null);
  assert.equal(getBearerToken({ headers: {} }), null);
});

test('checkout redirects are restricted to approved application origins', () => {
  assert.equal(isAllowedRedirectUrl('https://www.brightkeysolutions.com/checkout?payment=success'), true);
  assert.equal(isAllowedRedirectUrl('http://localhost:3000/checkout'), true);
  assert.equal(isAllowedRedirectUrl('https://attacker.example/checkout'), false);
  assert.equal(isAllowedRedirectUrl('not-a-url'), false);
});

test('CORS reflects only approved origins', () => {
  const headers = {};
  const res = { setHeader: (key, value) => { headers[key] = value; } };
  setApiCors({ headers: { origin: 'https://www.brightkeysolutions.com' } }, res);
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://www.brightkeysolutions.com');

  const deniedHeaders = {};
  const deniedRes = { setHeader: (key, value) => { deniedHeaders[key] = value; } };
  setApiCors({ headers: { origin: 'https://attacker.example' } }, deniedRes);
  assert.equal(deniedHeaders['Access-Control-Allow-Origin'], undefined);
});

test('checkout payload signatures reject altered totals and cart data', () => {
  const secret = 'test-checkout-signing-secret';
  const payload = {
    company_id: '00000000-0000-4000-8000-000000000001',
    total_cents: 125000,
    shipping_cents: 15000,
    discount_cents: 0,
    coupon_code: '',
    cart_items: [{ id: '00000000-0000-4000-8000-000000000002', quantity: 1, price: 110000 }]
  };
  const signature = signCheckoutPayload(payload, secret);
  assert.equal(verifyCheckoutPayload(payload, signature, secret), true);
  assert.equal(verifyCheckoutPayload({ ...payload, total_cents: 100 }, signature, secret), false);
});

test('sensitive settings and journal rows are not anonymously readable', () => {
  const migration = fs.readFileSync(new URL('../database/migrations/20260809_security_and_query_hardening.sql', import.meta.url), 'utf8');
  assert.match(migration, /Allow public storefront settings read/);
  assert.match(migration, /FOR SELECT\s+TO anon\s+USING \(key IN/);
  assert.match(migration, /ALTER TABLE public\.general_journal ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Allow tenant members journal access/);
  assert.doesNotMatch(migration, /FOR SELECT USING \(true\)/);
});

test('checkout APIs rebuild prices from server-side catalog data', () => {
  const paymongo = fs.readFileSync(new URL('../api/create-checkout-session.js', import.meta.url), 'utf8');
  const stripe = fs.readFileSync(new URL('../api/create-stripe-checkout-session.js', import.meta.url), 'utf8');
  const webhook = fs.readFileSync(new URL('../api/paymongo-webhook.js', import.meta.url), 'utf8');
  assert.match(paymongo, /buildServerCheckout/);
  assert.match(stripe, /buildServerCheckout/);
  assert.match(webhook, /verifyCheckoutPayload/);
  assert.doesNotMatch(paymongo, /const \{ company_id, billing, line_items/);
  assert.doesNotMatch(stripe, /const \{ company_id, line_items/);
});

test('employee registration contains no development bypass credential', () => {
  const registration = fs.readFileSync(new URL('../api/register-employee.js', import.meta.url), 'utf8');
  const verification = fs.readFileSync(new URL('../api/verify-invitation.js', import.meta.url), 'utf8');
  assert.equal(registration.includes('dev-bypass-key'), false);
  assert.equal(verification.includes('dev-bypass-key'), false);
  assert.equal(registration.includes('brightkey_invite_salt'), false);
  assert.equal(verification.includes('brightkey_invite_salt'), false);
});

test('account-only invitations do not create or update employee records', () => {
  const accountRegistration = fs.readFileSync(new URL('../api/register-account.js', import.meta.url), 'utf8');
  assert.equal(accountRegistration.includes("from('employees')"), false);
  assert.equal(accountRegistration.includes('employee_number'), false);
  assert.equal(accountRegistration.includes("from('tenant_members').insert"), true);
});

test('free subscription owner invitations retain owner dashboard access', () => {
  const source = fs.readFileSync(new URL('../api/register-account.js', import.meta.url), 'utf8');
  assert.match(source, /\['owner', 'admin'\]\.includes\(invitedRole\)/);
});

test('platform tenant listing stays behind an exact owner check and server-side tenant reads', () => {
  const source = fs.readFileSync(new URL('../api/platform-tenants.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/20260807_platform_owner_tenant_listing.sql', import.meta.url), 'utf8');
  assert.match(source, /johnzeustaller@gmail\.com/);
  assert.match(source, /rpc\('get_platform_tenants'\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /johnzeustaller@gmail\.com/);
  assert.match(migration, /FROM public\.tenants/);
  assert.match(migration, /LIMIT 100/);
  assert.match(migration, /GRANT EXECUTE .* TO authenticated/);
});

test('platform tenant deletion is ID-scoped, owner-gated, and protects the active owner workspace', () => {
  const api = fs.readFileSync(new URL('../api/platform-tenants.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/20260807_platform_tenant_deletion.sql', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../dashboard/master-settings.html', import.meta.url), 'utf8');
  assert.match(api, /\['GET', 'DELETE'\]/);
  assert.match(api, /UUID_PATTERN\.test\(tenantId\)/);
  assert.match(api, /delete_platform_tenant/);
  assert.match(migration, /auth\.jwt\(\) ->> 'email'/);
  assert.match(migration, /tenant_id = p_tenant_id\s+AND user_id = auth\.uid\(\)/);
  assert.match(migration, /LOWER\(TRIM\(v_owner_email\)\) = 'johnzeustaller@gmail\.com'/);
  assert.match(migration, /DELETE FROM public\.tenants WHERE id = p_tenant_id/);
  assert.match(page, /Permanently delete \$\{label\}/);
  assert.match(page, /method: 'DELETE'/);
});

test('platform signup email credentials stay owner-gated and feed subscription invitations', () => {
  const api = fs.readFileSync(new URL('../api/platform-email-integration.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/20260807_platform_email_integration.sql', import.meta.url), 'utf8');
  const subscription = fs.readFileSync(new URL('../api/subscription-requests.js', import.meta.url), 'utf8');
  assert.match(api, /johnzeustaller@gmail\.com/);
  assert.match(api, /platform_email_integrations/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /johnzeustaller@gmail\.com/);
  assert.match(subscription, /platform_email_integrations/);
  assert.match(subscription, /sender_name,api_key,integration_email/);
  assert.match(subscription, /const resendApiKey = platformEmail\.api_key/);
  assert.match(subscription, /const senderName = platformEmail\.sender_name/);
  assert.match(subscription, /const integrationEmail = platformEmail\.integration_email/);
  assert.doesNotMatch(subscription, /platformEmail\?\.api_key \|\| process\.env\.RESEND_API_KEY/);
});

test('platform owner gate permits the designated dual-role account without affecting tenant gates', () => {
  const auth = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
  const masterSettings = fs.readFileSync(new URL('../dashboard/master-settings.html', import.meta.url), 'utf8');
  assert.match(auth, /PLATFORM_OWNER_EMAIL = 'johnzeustaller@gmail\.com'/);
  assert.match(auth, /async function checkPlatformOwnerGate/);
  assert.match(auth, /role: 'platform_owner', tenantId: null/);
  assert.match(masterSettings, /BKAuth\.checkPlatformOwnerGate\('\/admin'\)/);
  assert.doesNotMatch(masterSettings, /BKAuth\.checkRoleGate\(\[\], '\/admin'\)/);
  assert.doesNotMatch(auth, /PLATFORM_SETTINGS_PATH/);
  assert.doesNotMatch(auth, /platformRouteAllowed/);
});
