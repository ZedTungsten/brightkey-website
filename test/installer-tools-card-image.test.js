import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../dashboard/booking-schedules/tools.js', import.meta.url), 'utf8');

test('tool cards prefer the current catalog image matched by SKU', () => {
  assert.match(script, /const catalogProduct = state\.products\.find\([\s\S]*?product\.sku[\s\S]*?issue\.sku/);
  assert.match(script, /const productImage = catalogProduct\?\.image_main \|\| issue\.product_image_url \|\| fallback;/);
  assert.match(script, /<img src="\$\{esc\(productImage\)\}" alt="\$\{esc\(issue\.sku\)\}"/);
});
