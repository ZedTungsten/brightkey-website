import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/booking-schedules.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../dashboard/booking-schedules/tools.js', import.meta.url), 'utf8');

test('SKU issuing includes both Tools and Supplies inventory products', () => {
  assert.match(script, /\['tools', 'supplies'\]\.includes\(String\(product\.category/);
  assert.match(page, /id="issue-tool-button"[^>]*>Issue SKU<\/button>/);
  assert.match(page, /id="tool-issue-modal-title">Issue SKU<\/h3>/);
  assert.match(page, /id="tool-issue-submit">Issue SKU<\/button>/);
});

test('SKU selector shows zero-stock products without allowing new issuance', () => {
  assert.doesNotMatch(script, /\.filter\(product => \(available\.get/);
  assert.match(script, /\$\{count\} available/);
  assert.match(script, /count <= 0 && !isSelectedIssue \? ' disabled'/);
});
