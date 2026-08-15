import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const js = fs.readFileSync(new URL('../dashboard/hiring/contracts/contracts.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dashboard/hiring/contracts/contracts.css', import.meta.url), 'utf8');

test('job codes and populated page counts use cyan while empty pages remain gray', () => {
  assert.match(js, /job\.public_code \? 'contract-data-number' : ''/);
  assert.match(js, /pages\.length \? 'contract-data-number' : 'contract-data-empty'/);
  assert.match(css, /\.contract-jobs-table \.contract-data-number \{ color: var\(--cyan-light\);/);
  assert.match(css, /\.contract-jobs-table \.contract-data-empty \{ color: var\(--text-muted\);/);
});
