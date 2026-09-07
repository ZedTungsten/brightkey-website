import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');

test('commissions preserve completed active products on partially cancelled orders', () => {
  assert.match(source, /function isCommissionLineCancelled\(/);
  assert.match(source, /products\.length > 0 && products\.every\(product => product\?\.cancelled === true\)/);
  assert.match(source, /const activeDoors = doors\.filter/);
  assert.match(source, /activeDoors\.every\(door => Boolean\(door\?\.completed \|\| door\?\.signature\)\)/);
  assert.doesNotMatch(source, /if \(!booking \|\| String\(booking\.status \|\| ''\)\.toLowerCase\(\) === 'cancelled'\) return false/);
});

test('cancelled product lines are excluded from commission totals and display', () => {
  const cancelledLineGuards = source.match(/isCommissionLineCancelled\(b, sku, (?:i|index)\)/g) || [];
  assert.ok(cancelledLineGuards.length >= 3);
});
