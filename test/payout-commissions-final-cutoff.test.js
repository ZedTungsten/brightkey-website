import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/commissions/index.html', import.meta.url), 'utf8');

test('commission tab allocates shared commission totals to payout cutoffs', () => {
  assert.match(source, /sales-commission-calculator\.js/);
  assert.match(source, /BKSalesCommissionCalculator\.amountsByEmployee/);
  assert.match(source, /getCommissionPayoutBucket/);
  assert.match(source, /sortedSchedules\.find\(day => sourceDay <= day\) \|\| finalCutoff/);
  assert.match(source, /rolloverMonthKey === targetMonthKey \? \{ day: firstCutoff, rollover: true \} : null/);
  assert.match(source, /const totalsByDay = new Map/);
  assert.match(source, /const rolloverTotalsByDay = new Map/);
  assert.match(source, /Roll Com:/);
  assert.match(source, /data\?\.value\?\.payoutSchedules \|\| \[15, 30\]/);
  assert.doesNotMatch(source, /storedAmountCentavos/);
});
