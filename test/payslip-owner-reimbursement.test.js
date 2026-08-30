import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payslip/index.html', import.meta.url), 'utf8');

test('owner payslips exclude GL reimbursements from their breakdown and cutoff totals', () => {
  assert.match(source, /const isOwner = this\.isOwnerEmployee\(emp\)/);
  assert.match(source, /if \(isOwner\) \{\s*empComms = 0;\s*parsedCommAssignments = \[\];\s*glReimbursements = \[\];\s*\}/);
  assert.match(source, /const totalGlReimbursements = glReimbursements\.reduce/);
  assert.match(source, /const glReimbursement = glReimbursements\.filter/);
});
