import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shared = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const warehousePages = [
  'defective.html',
  'dispatch.html',
  'inspected-page.html',
  'pack.html',
  'receive.html',
  'return.html',
  'transfer.html'
].map(file => fs.readFileSync(new URL(`../dashboard/warehouse/${file}`, import.meta.url), 'utf8'));

test('Every warehouse page renders Pack from the one authoritative RPC response', () => {
  assert.match(shared, /rpc\('get_warehouse_tab_counts'/);
  assert.match(shared, /Number\(row\.receive_count \|\| 0\),[\s\S]*Number\(row\.pack_count \|\| 0\),[\s\S]*Number\(row\.dispatch_count \|\| 0\)/);
  assert.doesNotMatch(shared, /getPackCount|visibleDispatchOrderCount|getUnreceivedCount/);
  warehousePages.forEach(page => {
    assert.match(page, /shared\.js\?v=20260910-unified-tab-counts/);
  });
});
