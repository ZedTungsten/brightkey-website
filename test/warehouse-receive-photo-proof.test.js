import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/warehouse/receive.html', import.meta.url), 'utf8');

test('Confirm Receipt identifies a missing receiving photo with a toast and red upload border', () => {
  assert.match(page, /if \(!recPhotoBlob\)\s*{\s*setReceiptPhotoProofError\(true\);\s*showToast\('Upload photo', true\);/);
  assert.match(page, /\.receipt-photo-proof-error\s*{\s*border-color: var\(--danger\) !important;/);
  assert.match(page, /container\.classList\.toggle\('receipt-photo-proof-error', hasError\)/);
});

test('receiving photo error clears after upload or camera capture', () => {
  const clearCalls = page.match(/setReceiptPhotoProofError\(false\)/g) || [];
  assert.ok(clearCalls.length >= 4, 'expected reset, close, upload, and capture to clear the photo error');
  assert.match(page, /recPhotoBlob = file;\s*setReceiptPhotoProofError\(false\);/);
  assert.match(page, /recPhotoBlob = blob;\s*setReceiptPhotoProofError\(false\);/);
});
