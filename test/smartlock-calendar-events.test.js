import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const syncSource = fs.readFileSync(new URL('../js/smartlock-calendar/sync.js', import.meta.url), 'utf8');
const calendarSource = fs.readFileSync(new URL('../js/smartlock-calendar/calendar.js', import.meta.url), 'utf8');
const assignmentsSource = fs.readFileSync(new URL('../js/smartlock-calendar/assignments.js', import.meta.url), 'utf8');
const jobTrackerSource = fs.readFileSync(new URL('../js/smartlock-calendar/job-tracker.js', import.meta.url), 'utf8');

test('installer calendar accepts assigned custom events and renders their saved names', () => {
  const filterBody = syncSource.match(/function filterInstallerDayEvents\(events\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(filterBody, /event\?\.type === 'day_off'/);
  assert.match(filterBody, /installer\?\.id === currentInstaller\.id/);
  assert.match(syncSource, /if \(event\?\.name\) return String\(event\.name\)\.trim\(\)/);
  assert.match(calendarSource, /escapeHtml\(eventName\)/);
});

test('installer calendar completes Lead and Service display roles from mixed product SKUs', () => {
  const context = {
    installerServiceCatalog: [{ sku: 'INSTALL-M' }],
    normalizeWorkflowSku: value => String(value || '').trim().toUpperCase(),
    result: null
  };
  vm.runInNewContext(`${assignmentsSource}\n${calendarSource}\nresult = completeCalendarInstallerRoles(
    [{ id: 'ronald', name: 'Ronald C.', role: 'service' }],
    ['G14 TT', 'INSTALL-M']
  );`, context);

  assert.deepEqual(
    Array.from(context.result, installer => `${installer.role}:${installer.id}`),
    ['lead:ronald', 'service:ronald']
  );
  assert.match(calendarSource, /completeCalendarInstallerRoles\(doorInstallers, sku\.split\(','\)\)/);
  assert.match(jobTrackerSource, /const displayRoles = completeInstallerWorkflowRoles\(d\.roles, d\.skus\)/);
  assert.match(jobTrackerSource, /if \(displayRoles\.includes\('lead'\)\)/);
  assert.match(jobTrackerSource, /if \(displayRoles\.includes\('service'\)\)/);
});
