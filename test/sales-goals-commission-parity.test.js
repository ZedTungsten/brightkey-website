import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const goals = fs.readFileSync(new URL('../dashboard/sales-goals.html', import.meta.url), 'utf8');

test('Goals Top Performers uses the same locked and cancellation-aware basis as Commissions', () => {
  assert.match(goals, /const snapshot = booking\?\.commission_lock_snapshot/);
  assert.match(goals, /booking\?\.commissions_locked && snapshot/);
  assert.match(goals, /function isCommissionLineCancelled\(/);
  assert.match(goals, /function getBookingEligibleCentavos\(b,[\s\S]*?isCommissionLineCancelled\(b, sku, i\)/);
  assert.match(goals, /function getCommissionAdjustmentForBooking\(b,[\s\S]*?isCommissionLineCancelled\(b, sku, index\)/);
});

test('Goals Top Performers matches commission readiness for product-only received orders', () => {
  assert.match(goals, /function isCommissionReady\(/);
  assert.match(goals, /booking\._received_photo_url[\s\S]*?isCommissionProductOnlyDoor/);
  assert.match(goals, /\.from\('delivery_bookings'\)[\s\S]*?\.select\('reference_id, status, received_photo_url, delivered_at'\)/);
  assert.match(goals, /if \(!isCommissionReady\(b\)\) return/);
});

test('Goals Top Performers aggregates the same order-total assignments as the summary', () => {
  assert.match(goals, /if \(!row\.employee_id \|\| row\.sku !== 'ORDER_TOTAL'\) return/);
  assert.match(goals, /const eligibleCentavos = finalEligibleCentavos/);
  assert.doesNotMatch(goals, /\.from\('installation_bookings'\)\s*\.select\('\*'\)/);
});
