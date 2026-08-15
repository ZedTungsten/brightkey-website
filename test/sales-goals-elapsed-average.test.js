import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-goals.html', import.meta.url), 'utf8');

test('sales goal averages use elapsed days and fractional weeks', () => {
  assert.match(source, /const elapsedPeriod = getStatsElapsedPeriod\(currentSelectedMonth\)/);
  assert.match(source, /totalOrders \/ elapsedPeriod\.weeks/);
  assert.match(source, /totalRevenuePHP \/ elapsedPeriod\.weeks/);
  assert.match(source, /totalRevenuePHP \/ elapsedPeriod\.days/);
  assert.match(source, /return \{ days, weeks: days \/ 7 \}/);
  assert.doesNotMatch(source, /avgRevPerWeek \/ 7/);
});
