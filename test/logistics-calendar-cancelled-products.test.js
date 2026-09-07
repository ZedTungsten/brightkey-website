import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/logistics-calendar/calendar.html', import.meta.url), 'utf8');

test('Logistics Calendar excludes cancelled product transactions', () => {
  assert.match(page, /visibleTransactions\(transactions\)\s*\{[\s\S]*transaction\.status[\s\S]*!== 'cancelled'/);
  assert.match(page, /const txs = this\.visibleTransactions\(orderTransactions\)/);
  assert.match(page, /if \(orderTransactions\.length > 0 && txs\.length === 0\) return/);
  assert.match(page, /txs = this\.visibleTransactions\(liveTxsRes\.data\)/);
});
