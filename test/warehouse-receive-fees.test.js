import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/warehouse/receive.html', import.meta.url), 'utf8');

test('delivery proof refresh preserves every saved fee used by the receipt modal', () => {
  assert.match(
    page,
    /\.select\('id, reference_id, customer_city, delivery_photo_url, base_fee, toll, tip_1, tip_2'\)/
  );
  assert.match(page, /feeInputValue\(booking\.base_fee\)/);
  assert.match(page, /feeInputValue\(booking\.toll\)/);
  assert.match(page, /feeInputValue\(booking\.tip_1\)/);
  assert.match(page, /feeInputValue\(booking\.tip_2\)/);
});
