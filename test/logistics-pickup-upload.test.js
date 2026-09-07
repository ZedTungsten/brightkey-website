import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dispatch = fs.readFileSync(new URL('../dashboard/warehouse/dispatch.html', import.meta.url), 'utf8');

test('delivery pickup compresses phone images before the Base64 upload request', () => {
  assert.match(dispatch, /function compressPickupImage\(fileOrBlob\)/);
  assert.match(dispatch, /const maxDimension = 1200/);
  assert.match(dispatch, /Math\.min\(1, maxDimension \/ Math\.max\(image\.width, image\.height\)\)/);
  assert.match(dispatch, /canvas\.toBlob\([\s\S]*'image\/jpeg', 0\.8\)/);
  assert.match(dispatch, /const compressedPhoto = await compressPickupImage\(pickupPhotoBlob\)/);
  assert.match(dispatch, /const base64 = await blobToBase64\(compressedPhoto\)/);
  assert.match(dispatch, /uploadResult\.error \|\| 'Photo upload failed'/);
});
