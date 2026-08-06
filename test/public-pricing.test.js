import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('public pricing page ships its root-relative assets and subscription form', () => {
  const page = read('pricing.html');
  const styles = read('css/pricing.css');
  assert.match(page, /href="\/css\/pricing\.css"/);
  assert.match(page, /src="\/js\/pricing\.js"/);
  assert.match(page, /id="pricing-grid"/);
  assert.match(page, /id="subscribe-form"/);
  assert.match(page, /id="subscriber-country"/);
  assert.match(styles, /\.pricing-alert\[hidden\], #subscribe-alert\[hidden\][^{]*\{[^}]*display: none !important/);
  assert.match(styles, /\.pricing-grid\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(styles, /\.pricing-card:last-child:nth-child\(odd\)/);
});

test('pricing browser code loads visible plans and submits to the protected API', () => {
  const source = read('js/pricing.js');
  const masterSettings = read('dashboard/master-settings.html');
  assert.match(source, /is_visible=eq\.true/);
  assert.match(source, /limit=5/);
  assert.match(masterSettings, /Only five pricing plans can be active/);
  assert.match(masterSettings, /visibleTierCount >= 5/);
  assert.match(source, /fetch\('\/api\/subscription-requests'/);
  assert.match(source, /body\.consent|consent:/);
});

test('subscription API retains validation, throttling, and server-side plan verification', () => {
  const source = read('api/subscription-requests.js');
  assert.match(source, /createServiceClient/);
  assert.match(source, /enforceRateLimit/);
  assert.match(source, /UUID_PATTERN\.test\(planId\)/);
  assert.match(source, /\.eq\('is_visible', true\)/);
  assert.match(source, /register_subscription_request/);
  assert.match(source, /String\(error\?\.code \|\| ''\) === '23505'/);
  assert.match(source, /This email is already registered or has an existing subscription request/);
  assert.match(source, /company_invitations/);
  assert.match(source, /role:\s*'owner'/);
  assert.match(source, />Create Account</);
  assert.match(source, /account_email_sent:\s*freeSignup/);
  assert.match(source, /platform_email_integrations/);
  assert.match(source, /const resendApiKey = platformEmail\.api_key/);
  assert.doesNotMatch(source, /platformEmail\?\.api_key \|\| process\.env\.RESEND_API_KEY/);
});

test('subscription registration rejects duplicate normalized emails atomically', () => {
  const migration = read('database/migrations/20260807_unique_subscription_email.sql');
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /LOWER\(TRIM\(owner_email\)\) = v_email/);
  assert.match(migration, /LOWER\(TRIM\(business_email\)\) = v_email/);
  assert.match(migration, /ERRCODE = '23505'/);
});
