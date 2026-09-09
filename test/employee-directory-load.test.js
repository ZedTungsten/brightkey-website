import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/employee-directory.js', import.meta.url), 'utf8');

test('Employee Directory does not query the removed dashboard_roles table on load', () => {
  assert.doesNotMatch(script, /from\('dashboard_roles'\)/);
  assert.match(page, /employee-directory\.js\?v=9/);
});
