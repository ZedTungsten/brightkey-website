import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installers = fs.readFileSync('dashboard/booking-schedules/installers.js', 'utf8');
const html = fs.readFileSync('dashboard/booking-schedules.html', 'utf8');
const css = fs.readFileSync('dashboard/booking-schedules.css', 'utf8');

test('installer summary names filter the assignment history', () => {
  assert.match(installers, /class="installer-summary-filter-link" data-installer-id=/);
  assert.match(installers, /installerHistorySelectedIds = new Set\(\[String\(employeeId\)\]\)/);
  assert.match(installers, /window\.drawInstallerAssignmentHistory\(\)/);
  assert.match(installers, /\.installer-history-section'\)\?\.scrollIntoView/);
});

test('inline summary fallback preserves the installer filter link', () => {
  assert.match(html, /class="installer-summary-filter-link" data-installer-id=/);
  assert.match(html, /window\.filterInstallerAssignmentHistory\?\./);
});

test('installer history links use the canonical cyan tokens', () => {
  assert.match(css, /\.installer-summary-filter-link\s*\{[^}]*color: var\(--cyan-light\)/s);
  assert.match(css, /\.installer-summary-filter-link:hover\s*\{ color: var\(--cyan\); \}/);
});
