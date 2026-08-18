import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeUsername } from '../api/customer-login.js';
import { productItems, publicProduct } from '../api/customer-portal-data.js';

test('customer credentials normalize exactly like the CS customer list', () => {
  assert.equal(normalizeUsername(' John-Taller '), 'johntaller');
  assert.equal(normalizePhone('+63 917-123-4567'), '639171234567');
});

test('portal purchase items retain SKU and quantity pairing', () => {
  assert.deepEqual(productItems({ product_skus: 'A12 TT | B11 TT', product_qtys: '2 | 1' }), [
    { sku: 'A12 TT', quantity: 2 },
    { sku: 'B11 TT', quantity: 1 }
  ]);
});

test('public product payload exposes only portal catalog fields', () => {
  const result = publicProduct({
    id: 'product-id', sku: 'A12 TT', title: 'Lock', image_main: 'https://example.com/a.jpg',
    company_id: 'secret-company', dealer_price: 123, specifications: { warranty: '1 year' }
  }, { wifi: 'Yes' });
  assert.equal(result.id, 'product-id');
  assert.equal(result.image, 'https://example.com/a.jpg');
  assert.equal(result.company_id, undefined);
  assert.equal(result.dealer_price, undefined);
  assert.deepEqual(result.features, { wifi: 'Yes' });
});
