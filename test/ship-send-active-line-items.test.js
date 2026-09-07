import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/ship/send.html', import.meta.url), 'utf8');

test('Ship Send ignores cancelled SKUs without hiding active lines from the same order', () => {
  assert.match(page, /return items\.filter\(item => item\.status !== 'cancelled' && !this\.isServiceSku\(item\.sku\)\)/);
  assert.match(page, /const items = this\.visibleItemsForBooking\(booking\)/);
  assert.match(page, /group\.items = this\.visibleItemsForBooking\(group\.booking\)/);
  assert.match(page, /group\.items\.length && !this\.isHiddenSendStatus/);
});
