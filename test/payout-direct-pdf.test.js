import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('payout row PDF action generates the file without redirecting to Payslip', () => {
  assert.match(source, /async shortcutSavePayslip\(empId\) \{\s*await this\.downloadPayslipDirect\(empId\);\s*\}/);
  assert.doesNotMatch(source, /window\.location\.href = `\/dashboard\/payout-tracker\/payslip/);
  assert.match(source, /BKPayslipRenderer\.downloadSheet/);
});

test('direct owner PDF excludes GL reimbursement like the Payslip page', () => {
  assert.match(source, /const glReimbursement = isOwner \|\| commissionOnly \? 0 : this\._glAdditionsForEmpMonth/);
});
