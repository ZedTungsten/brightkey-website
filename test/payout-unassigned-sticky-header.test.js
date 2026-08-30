import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('unassigned payout group uses the same sticky label structure as department groups', () => {
  assert.match(source, /<div class="dept-header-sticky">\$\{esc\(dept\)\} Department<\/div>/);
  assert.match(source, /<div class="dept-header-sticky">Unassigned Department \/ Pool<\/div>/);
});
