import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('payout summary leaves room between the total row and horizontal scrollbar', () => {
  assert.match(source, /#summary-table\s*\{\s*margin-bottom:\s*1rem;/);
});
