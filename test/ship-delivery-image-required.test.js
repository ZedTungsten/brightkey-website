import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/ship/send.html', import.meta.url), 'utf8');

test('Ship delivery bookings require a successfully uploaded information image', () => {
  assert.match(page, /if \(!DeliveryApp\.deliveryPhotoBlob\)[\s\S]*delivery-file-error/);
  assert.match(page, /if \(!uploadResult\?\.url\) throw new Error\('Delivery photo upload returned no image URL'\)/);
  assert.match(page, /if \(!isReceive && hasDeliveryDetails && !this\.cshipDelPhotoBlob\)/);
  assert.match(page, /if \(!deliveryPhotoUrl\) throw new Error\('Delivery information upload failed'\)/);
});
