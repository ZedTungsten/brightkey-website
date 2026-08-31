import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/attendance.html', import.meta.url), 'utf8');

test('Attendance uses the canonical right-aligned month navigator', () => {
  assert.match(source, /class="month-picker" id="attendance-month-navigator" aria-label="Attendance month"/);
  assert.match(source, /aria-label="Previous month"[\s\S]*?m15 18-6-6 6-6[\s\S]*?aria-label="Next month"[\s\S]*?m9 18 6-6-6-6/);
  assert.doesNotMatch(source, /class="month-btn"/);
  assert.match(source, /\.month-picker\s*\{[\s\S]*?margin-left:\s*auto;[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?box-shadow:\s*var\(--shadow-sm\);/);
  assert.match(source, /\.month-picker button\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
  assert.match(source, /\.month-title-display\s*\{[\s\S]*?min-width:\s*130px;[\s\S]*?font-size:\s*0\.9rem;[\s\S]*?font-weight:\s*700;/);
});
