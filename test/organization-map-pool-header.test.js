import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/organization-map.html', import.meta.url), 'utf8');

test('the minimized unassigned employee header keeps the expanded width with a circular count', () => {
  assert.match(page, /\.employee-pool-panel\s*\{[\s\S]*?width: 300px;/);
  assert.match(page, /\.employee-pool-panel\.minimized\s*\{[\s\S]*?width: 300px;/);
  assert.match(page, /\.pool-title\s*\{[\s\S]*?white-space: nowrap;/);
  assert.match(page, /\.pool-badge\s*\{[\s\S]*?width: 1\.75rem;[\s\S]*?height: 1\.75rem;[\s\S]*?border-radius: 50%;/);
});
