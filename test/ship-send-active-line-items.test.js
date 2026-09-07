import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/ship/send.html', import.meta.url), 'utf8');

test('Ship Send labels reserved orders as For Packing', () => {
  assert.match(page, /latestStatus === 'reserved'[\s\S]*?\? 'For Packing'/);
  assert.match(page, /status === 'reserved'\) return \{ background: '#f97316', color: '#fff' \}/);
  assert.match(page, /status === 'packed'\) return \{ background: '#22c55e', color: '#fff' \}/);
  assert.doesNotMatch(page, /For QA/);
});

test('Ship Send ignores cancelled SKUs without hiding active lines from the same order', () => {
  assert.match(page, /return items\.filter\(item => item\.status !== 'cancelled' && !this\.isServiceSku\(item\.sku\)\)/);
  assert.match(page, /const items = this\.visibleItemsForBooking\(booking\)/);
  assert.match(page, /group\.items = this\.visibleItemsForBooking\(group\.booking\)/);
  assert.match(page, /group\.items\.length[\s\S]*&& !this\.isHiddenSendStatus/);
});

test('Ship Send removes orders after they are booked for delivery', () => {
  assert.match(page, /hasDeliveryBooking\(referenceId\)[\s\S]*this\.deliveryBookings\.some\(booking => booking\.reference_id === referenceId\)/);
  assert.match(page, /!this\.hasDeliveryBooking\(booking\.order_no\)/);
  assert.match(page, /!this\.hasDeliveryBooking\(group\.reference_id\)/);
});
