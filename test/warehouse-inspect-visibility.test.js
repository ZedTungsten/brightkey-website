import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sharedSource = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');

test('Inspect badge uses the same non-inventory filter as the visible Inspect queue', () => {
  assert.match(sharedSource, /document\.getElementById\('inspect-list'\)/);
  assert.match(sharedSource, /transaction\.status === 'reserved'/);
  assert.match(sharedSource, /!window\.isNonInventoryItem/);
  assert.match(sharedSource, /renderBadges\([\s\S]*?inspectCount,/);
});
