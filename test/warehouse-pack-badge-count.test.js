import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shared = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const warehousePages = [
  'damaged.html',
  'dispatch.html',
  'inspected-page.html',
  'pack.html',
  'receive.html',
  'return.html',
  'transfer.html'
].map(file => fs.readFileSync(new URL(`../dashboard/warehouse/${file}`, import.meta.url), 'utf8'));

test('Warehouse Pack badge always uses the visible unique-order predicate', () => {
  assert.match(shared, /const getPackCount = \(\) => \[\.\.\.new Set/);
  assert.match(shared, /renderBadges\([\s\S]*Number\(row\.receive_count \|\| 0\),[\s\S]*getPackCount\(\),[\s\S]*dispatchCount/);
  assert.doesNotMatch(shared, /document\.getElementById\('pack-list'\) \? getPackCount\(\) : Number\(row\.pack_count/);
  warehousePages.forEach(page => {
    assert.match(page, /shared\.js\?v=20260907-pack-badge-orders/);
  });
});
