import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('commission-only employees remain visible with no salary', () => {
  assert.match(source, /isCommissionOnlyEmployee\(emp, monthKey = this\.monthKey\(\)\)/);
  assert.match(source, /this\.isRegularPayoutEmployee\(emp,\s*mk\)\s*\|\|\s*this\.isCommissionOnlyEmployee\(emp,\s*mk\)/);
  assert.match(source, /const baseSalary\s+= commissionOnly \? 0 : \(emp\.salary \|\| 0\)/);
  assert.match(source, /let isEligible = commissionOnly \? commsVal > 0 : regularCutoffEligible/);
  assert.match(source, /const requiredDays = commissionOnly/);
  assert.match(source, /commissionOnly \|\| this\.isActiveEmployee\(emp\) \? null : this\.getInactiveDate\(emp\)/);
});
