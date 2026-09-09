import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../dashboard/booking-schedules/tools.js', import.meta.url), 'utf8');

test('tool cards edit issues while pencil buttons update status', () => {
  assert.match(script, /data-status-issue-id=/);
  assert.match(script, /const status = event\.target\.closest\('\[data-status-issue-id\]'\);[\s\S]*?openStatusModal\(issue\);/);
  assert.match(script, /const card = event\.target\.closest\('\[data-issue-id\]'\);[\s\S]*?if \(issue\) openIssueModal\(issue\);/);
  assert.match(script, /function openStatusModal\(issue\) \{[\s\S]*?TERMINAL\.has\(issue\.lifecycle_status\)[\s\S]*?openModal\('tool-status-modal'\);/);
});
