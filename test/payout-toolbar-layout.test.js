import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/payout-tracker/payout/index.html', import.meta.url), 'utf8');

test('Payout places Prorated across from the page title and month navigation right', () => {
  assert.match(source, /<div class="top-bar">[\s\S]*?<span class="top-bar-title">Payout Tracker<\/span>[\s\S]*?<div class="payout-top-actions">[\s\S]*?id="btn-prorated"/);
  assert.match(source, /\.payout-top-actions \{[\s\S]*?margin-left: auto;/);
  assert.match(source, /\.payout-month-toolbar \{[\s\S]*?justify-content: flex-end;/);
  assert.match(source, /<div class="payout-month-toolbar">[\s\S]*?<div class="payout-month-nav">[\s\S]*?id="btn-prev-month"[\s\S]*?id="btn-next-month"/);
  assert.equal((source.match(/id="btn-prorated"/g) || []).length, 1);
});
