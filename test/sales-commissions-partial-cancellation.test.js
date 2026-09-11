import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');

test('commissions preserve completed active products on partially cancelled orders', () => {
  assert.match(source, /function isCommissionLineCancelled\(/);
  assert.match(source, /products\.length > 0 && products\.every\(product => product\?\.cancelled === true\)/);
  assert.match(source, /const activeDoors = doors\.filter/);
  assert.match(source, /activeDoors\.every\(door => \{/);
  assert.match(source, /Boolean\(door\?\.completed \|\| door\?\.signature\)/);
  assert.match(source, /booking\._received_photo_url[\s\S]*isCommissionProductOnlyDoor/);
  assert.doesNotMatch(source, /if \(!booking \|\| String\(booking\.status \|\| ''\)\.toLowerCase\(\) === 'cancelled'\) return false/);
});

test('cancelled product lines are excluded from commission totals and display', () => {
  const cancelledLineGuards = source.match(/isCommissionLineCancelled\(b, sku, (?:i|index)\)/g) || [];
  assert.ok(cancelledLineGuards.length >= 3);
});

test('commission rows retain live active products while calculations use the locked basis', () => {
  assert.match(source, /dbBookings = bookingsRes\.data \|\| \[\];/);
  assert.doesNotMatch(source, /dbBookings = \(bookingsRes\.data \|\| \[\]\)\.map\(getCommissionBasisBooking\)/);
  assert.match(source, /booking\?\.commissions_locked && snapshot/);
  assert.match(source, /const snapshot = booking\?\.commission_lock_snapshot/);
  assert.doesNotMatch(source, /const snapshot = booking\?\.commission_basis_snapshot/);
  assert.match(source, /function getBookingEligibleCentavos\(b,[\s\S]*?b = getCommissionBasisBooking\(b\);/);
});

test('locking captures the latest live commission basis with company-scoped confirmation', () => {
  assert.match(source, /function createCommissionLockSnapshot\(booking\)/);
  assert.match(source, /if \(targetLocked\) updatePayload\.commission_lock_snapshot = createCommissionLockSnapshot\(booking\)/);
  assert.match(source, /\.eq\('company_id', currentCompanyId\)[\s\S]*\.select\('commissions_locked, commission_lock_snapshot'\)/);
});

test('receipt actions fetch the latest company-scoped booking before rendering', () => {
  assert.match(source, /window\.openViewReceiptById = async function\(bookingId\)[\s\S]*?window\.open\('', '_blank'\)[\s\S]*?from\('installation_bookings'\)[\s\S]*?\.eq\('company_id', currentCompanyId\)[\s\S]*?\.eq\('id', bookingId\)[\s\S]*?\.single\(\)/);
  assert.doesNotMatch(source, /window\.openViewReceiptById = async function\(bookingId\) \{\s*const b = dbBookings\.find/);
});
