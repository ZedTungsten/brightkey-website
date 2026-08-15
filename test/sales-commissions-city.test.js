import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');

test('sales commissions City column uses customer_city rather than street address', () => {
  assert.match(source, /const city = String\(b\.customer_city \|\| ''\)\.trim\(\) \|\| '—'/);
  assert.doesNotMatch(source, /const addressParts = \(b\.customer_address \|\| ''\)\.split\(','\)/);
  assert.match(source, /<td>\$\{escapeHtml\(city\)\}<\/td>/);
});
