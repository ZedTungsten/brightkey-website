import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/logistics-calendar/calendar.html', import.meta.url), 'utf8');

test('Logistics Calendar uses the canonical right-aligned month navigator', () => {
  assert.match(source, /\.month-picker\s*\{[\s\S]*?margin-left:\s*auto;[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?box-shadow:\s*var\(--shadow-sm\);/);
  assert.match(source, /\.month-picker button\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
  assert.match(source, /\.month-picker span\s*\{[\s\S]*?min-width:\s*130px;[\s\S]*?font-size:\s*0\.9rem;[\s\S]*?font-weight:\s*700;/);
  assert.match(source, /id="calendar-month-navigator"[\s\S]*?aria-label="Previous month"[\s\S]*?m15 18-6-6 6-6[\s\S]*?aria-label="Next month"[\s\S]*?m9 18 6-6-6-6/);
  assert.doesNotMatch(source, /[◀▶]/);
});

test('Logistics Calendar mirrors the Booking Calendar controls and padding', () => {
  assert.match(source, /\.scroll-container\s*\{[^}]*padding:\s*1\.25rem;[^}]*gap:\s*1rem;/);
  assert.match(source, /class="calendar-controls-row"[\s\S]*?id="calendar-search-input"[\s\S]*?placeholder="Search order number, name, location, SKU\.\.\."[\s\S]*?id="calendar-month-navigator"/);
  assert.match(source, /\.calendar-controls-row\s*\{[\s\S]*?gap:\s*1rem;[\s\S]*?padding-block:\s*0\.4rem;/);
  assert.match(source, /handleSearch\(value\)[\s\S]*?this\.searchQuery[\s\S]*?this\.renderCalendar\(\);/);
});
