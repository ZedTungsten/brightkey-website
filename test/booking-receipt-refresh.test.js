import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('opening a booking receipt reloads the latest persisted invoice fields', () => {
  const source = fs.readFileSync(new URL('../dashboard/booking-schedules/receipt.js', import.meta.url), 'utf8');

  assert.match(source, /from\('installation_bookings'\)/);
  assert.match(source, /\.eq\('company_id', receiptCompanyId\)/);
  assert.match(source, /\.eq\('id', b\.id\)/);
  assert.match(source, /b = latestBooking;/);
  assert.ok(source.indexOf('b = latestBooking;') < source.indexOf("rpc('lock_commission_basis_for_ar'"));
  assert.match(source, /b = \{ \.\.\.b, commission_basis_snapshot: lockedBasis \}/);
  assert.doesNotMatch(source, /b = \{ \.\.\.b, \.\.\.lockedBasis/);
});
