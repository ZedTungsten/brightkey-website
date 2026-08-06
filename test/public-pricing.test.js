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
});

test('pricing browser code loads visible plans and submits to the protected API', () => {
  const source = read('js/pricing.js');
  assert.match(source, /is_visible=eq\.true/);
  assert.match(source, /limit=20/);
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
});
