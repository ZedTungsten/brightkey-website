import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/ship/send.html', import.meta.url), 'utf8');

test('Ship Send keeps individual SKUs on one line at narrow widths', () => {
  assert.match(page, /th\.send-sku-column,[\s\S]*td\.send-sku-column\s*\{[\s\S]*min-width: 150px;[\s\S]*white-space: nowrap;/);
  assert.match(page, /<th class="send-sku-column">SKU<\/th>/);
  assert.match(page, /<td class="send-sku-column">\$\{skusHtml\}<\/td>/);
});
