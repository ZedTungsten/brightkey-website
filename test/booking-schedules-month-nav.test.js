import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dashboard/booking-schedules.css', import.meta.url), 'utf8');

test('Booking Schedules uses the canonical month navigator', () => {
  assert.match(html, /class="month-picker" id="calendar-month-navigator" aria-label="Installation month"/);
  assert.match(html, /aria-label="Previous month"[\s\S]*?m15 18-6-6 6-6[\s\S]*?aria-label="Next month"[\s\S]*?m9 18 6-6-6-6/);
  assert.doesNotMatch(html, /[◀▶]/);

  assert.match(css, /\.month-picker\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?border-radius:\s*var\(--radius-md\);[\s\S]*?box-shadow:\s*var\(--shadow-sm\);/);
  assert.match(css, /\.month-picker button\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
  assert.match(css, /\.month-picker svg\s*\{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;/);
  assert.match(css, /\.month-title\s*\{[\s\S]*?min-width:\s*130px;[\s\S]*?font-size:\s*0\.9rem;[\s\S]*?font-weight:\s*700;/);
});
