import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('completed service-only calendar jobs use the orange status pill', () => {
  const source = fs.readFileSync(new URL('../dashboard/booking-schedules/index.js', import.meta.url), 'utf8');

  assert.match(source, /activeProductSkus\.length > 0 && activeProductSkus\.every/);
  assert.match(source, /category \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'service'/);
  assert.match(source, /isServiceOnly \? '#F59E0B' : '#22C55E'/);
  assert.match(source, /background:\$\{completedBadgeColor\}/);
});
