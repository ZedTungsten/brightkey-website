import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/booking-schedules/tools.js', import.meta.url), 'utf8');

test('issued tool cards open a read-first modal with an explicit edit action', () => {
  assert.match(page, /id="tool-issue-read-view" hidden/);
  assert.match(page, /id="tool-issue-edit-button" hidden>Edit<\/button>[\s\S]*?id="tool-issue-submit"/);
  assert.match(script, /function setIssueEditMode\(editing\)/);
  assert.match(script, /setIssueEditMode\(!issue\);/);
  assert.match(script, /renderIssueDetails\(issue\);/);
});

test('read-only proof photos open the shared theater without edit controls', () => {
  assert.match(page, /id="tool-issue-read-photos"/);
  assert.match(script, /button\.dataset\.photoUrl = url;/);
  assert.match(script, /window\.openLightbox\(photo\.dataset\.photoUrl\)/);
});
