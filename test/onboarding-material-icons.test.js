import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const js = fs.readFileSync(new URL('../dashboard/onboarding.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dashboard/onboarding.css', import.meta.url), 'utf8');

test('onboarding material icons distinguish blue documents and red videos', () => {
  assert.match(js, /isVideo \? 'is-video' : 'is-document'/);
  assert.match(css, /\.onboarding-material-card-icon\.is-document \{ color: #3b82f6; \}/);
  assert.match(css, /\.onboarding-material-card-icon\.is-video \{ color: #ef4444; \}/);
});

test('video icon is a square with play button and no film strips', () => {
  assert.match(js, /<rect x="3" y="3" width="18" height="18" rx="2"\/><path d="m10 8 6 4-6 4Z"\/>/);
  assert.doesNotMatch(js, /M7 4v4M7 12v4/);
});

test('signed date uses the same success green as the signed status', () => {
  assert.match(css, /\.onboarding-contract-details > \.onboarding-contract-signed-date \{ color: var\(--success\);/);
  assert.match(css, /\.contract-sign-status\.signed \{[^}]*color: var\(--success\);/);
});

test('employee materials render in containers headed by their group name', () => {
  assert.match(js, /function materialGroup\(file\)/);
  assert.match(js, /<section class="onboarding-material-group"><header class="onboarding-material-group-header"><h3>\$\{esc\(group\)\}<\/h3><\/header>/);
  assert.match(css, /\.onboarding-material-group \{[^}]*border: 1px solid var\(--border\)/);
});
