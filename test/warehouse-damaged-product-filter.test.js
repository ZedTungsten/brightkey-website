import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../dashboard/warehouse/defective.html', import.meta.url),
  'utf8'
);

test('damaged-goods SKU choices exclude service, supply, and tool categories', () => {
  assert.match(source, /\.select\('id, sku, title, business, category, image_main'\)/);
  assert.match(source, /new Set\(\['service', 'services', 'supply', 'supplies', 'tool', 'tools'\]\)/);
  assert.match(source, /products\.filter\(isDamageEligibleProduct\)\.map\(product =>/);
});

test('damaged-goods records retain the complete product lookup', () => {
  assert.match(source, /function productFor\(record\) \{[\s\S]*products\.find\(product => product\.id === record\.product_id\)/);
});

test('damaged-goods suppliers are limited to the selected product business', () => {
  assert.match(source, /id="damage-sku" required onchange="populateSupplierOptions\('', this\.value\)"/);
  assert.match(source, /\.select\('id, sku, title, business, category, image_main'\)/);
  assert.match(source, /\.select\('id, name, business_id, street_address, city, province, contact_number, email'\)/);
  assert.match(source, /\.from\('tenant_businesses'\)[\s\S]*\.select\('id, name'\)/);
  assert.match(source, /\.replace\(\/\[_-\]\+\/g, ' '\)[\s\S]*\.replace\(\/s\$\/, ''\)/);
  assert.match(source, /return suppliers\.filter\(supplier => !supplier\.business_id \|\| supplier\.business_id === business\?\.id\)/);
  assert.match(source, /populateSupplierOptions\(record\.supplier_id, record\.product_id\)/);
});

test('uploaded damaged-goods media opens in an accessible theater viewer', () => {
  assert.match(source, /id="damage-media-theater"[\s\S]*role="dialog"[\s\S]*id="damage-theater-image"[\s\S]*id="damage-theater-video" controls playsinline/);
  assert.match(source, /data-media-kind="image"[\s\S]*onclick="openDamageMediaTheater\(this\)"/);
  assert.match(source, /data-media-kind="video"[\s\S]*onclick="openDamageMediaTheater\(this\)"/);
  assert.match(source, /function isSafeDamageMediaUrl[\s\S]*data:image/);
  assert.match(source, /video\.pause\(\)[\s\S]*video\.removeAttribute\('src'\)[\s\S]*video\.load\(\)/);
  assert.match(source, /damage-media-theater'\)\.classList\.contains\('open'\)[\s\S]*closeDamageMediaTheater\(\)/);
});
