import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/ship/receive.html', import.meta.url), 'utf8');

test('Ship Receive Send badge matches active visible Send orders', () => {
  assert.doesNotMatch(page, /\.in\('status', \['packed', 'reserved', 'inspect', 'ordered'\]\)/);
  assert.match(page, /select\('order_no, status, product_skus, product_qtys, scheduled_date, customer_address, customer_phone'\)/);
  assert.match(page, /select\('id, sku, title, category'\)/);
  assert.match(page, /const visibleBookings = this\.bookings\.filter/);
  assert.match(page, /this\.deliveryBookings\.some\(deliveryBooking => deliveryBooking\.reference_id === orderNo\)/);
  assert.match(page, /item\.status !== 'cancelled'/);
  assert.match(page, /const sendCount = new Set\(visibleBookings\.map/);
});
