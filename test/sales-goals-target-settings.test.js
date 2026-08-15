import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-goals.html', import.meta.url), 'utf8');

test('sales statistics targets load, render, and save through company settings', () => {
  assert.match(source, /const defaultStatsTargets = Object\.freeze/);
  assert.match(source, /data\?\.value\?\.stats_targets\?\.\[key\]/);
  assert.match(source, /stats_targets: nextStatsTargets/);
  assert.match(source, /settings-target-total-orders/);
  assert.match(source, /settings-target-revenue-per-day/);
  assert.match(source, /id="target-total-orders"/);
  assert.match(source, /id="target-revenue-per-day"/);
});
