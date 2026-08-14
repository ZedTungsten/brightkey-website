import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const syncSource = fs.readFileSync(new URL('../js/smartlock-calendar/sync.js', import.meta.url), 'utf8');
const calendarSource = fs.readFileSync(new URL('../js/smartlock-calendar/calendar.js', import.meta.url), 'utf8');

test('installer calendar accepts assigned custom events and renders their saved names', () => {
  const filterBody = syncSource.match(/function filterInstallerDayEvents\(events\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(filterBody, /event\?\.type === 'day_off'/);
  assert.match(filterBody, /installer\?\.id === currentInstaller\.id/);
  assert.match(syncSource, /if \(event\?\.name\) return String\(event\.name\)\.trim\(\)/);
  assert.match(calendarSource, /escapeHtml\(eventName\)/);
});
