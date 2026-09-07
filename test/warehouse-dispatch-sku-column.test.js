import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/warehouse/dispatch.html', import.meta.url), 'utf8');

test('Warehouse Dispatch keeps individual SKUs on one line at narrow widths', () => {
  assert.match(page, /th\.dispatch-sku-column,[\s\S]*td\.dispatch-sku-column\s*\{[\s\S]*min-width: 150px;[\s\S]*white-space: nowrap;/);
  assert.match(page, /<th class="dispatch-sku-column">SKU<\/th>/);
  assert.match(page, /<td class="dispatch-sku-column">\$\{skusHtml\}<\/td>/);
});
