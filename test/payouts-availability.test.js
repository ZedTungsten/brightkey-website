import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/payouts.html', import.meta.url), 'utf8');

test('payouts page includes payout-snapshots script and supports snapshot objects in isCutoffPaid', () => {
  assert.match(source, /<script src="\.\.\/js\/payout-snapshots\.js"><\/script>/);
  assert.match(source, /isCutoffPaid\(entry\)/);
  assert.match(source, /window\.BKPayoutSnapshots\.isPaid\(entry\)/);
  assert.match(source, /scheds\.every\(day => \{\s*return this\.isCutoffPaid\(state\[`\$\{this\.employee\.id\}_\$\{day\}`\]\);/);
});
