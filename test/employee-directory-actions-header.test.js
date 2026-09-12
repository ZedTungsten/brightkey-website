import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../dashboard/employee-directory.css', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../dashboard/employee-directory.html', import.meta.url), 'utf8');

test('employee directory Actions header is not anchored to the right', () => {
  assert.match(css, /\.dir-table thead th\.col-actions \{[^}]*right: auto;/);
  assert.match(page, /employee-directory\.css\?v=6/);
});
