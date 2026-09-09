import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/warehouse/inspected-page.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/warehouse/inspected.js', import.meta.url), 'utf8');

test('Deployed table shows Customer Name immediately after Ref Order', () => {
  assert.match(page, /<th>Ref Order<\/th><th>Customer Name<\/th><th>Media<\/th>/);
  assert.match(page, /id="deployed-list"><tr><td colspan="8"/);
  assert.match(script, /\[record\.code, record\.sku, record\.reference_id, record\.customer_name\]/);
});

test('Deployed loader includes transaction customer names and aligned states', () => {
  assert.match(script, /select\('id, reference_id, sku, customer_name, timestamp_dispatched'\)/);
  assert.match(script, /customer_name: transaction\?\.customer_name/);
  assert.match(script, /cell\.colSpan = 8/);
  assert.match(script, /colspan="8"/);
});
