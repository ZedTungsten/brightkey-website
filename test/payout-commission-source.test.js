import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('payout commissions use the Sales Goals installation date without a completion gate', () => {
  assert.match(source, /_commissionDate\(b\) \{\s*return b\?\.scheduled_date \|\| b\?\.created_at \|\| null;/);
  assert.doesNotMatch(source, /_isCommissionEligibleBooking/);
  assert.match(source, /const commissionDate = this\._commissionDate\(b\);/);
});

test('payout commissions use the Sales Goals calculator instead of stored assignment amounts', () => {
  assert.match(source, /BKSalesCommissionCalculator\.amountsByEmployee/);
  assert.doesNotMatch(source, /_getStoredCommAmount/);
  assert.match(source, /'commissions_config'/);
});

test('the final commission cutoff includes the calendar month end', () => {
  assert.match(source, /day: sorted\.find\(day => itemDay <= day\) \|\| sorted\[sorted\.length - 1\]/);
  assert.match(source, /this\._commissionCutoffBucket\(commissionDate, sortedScheds\)/);
});
