import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../dashboard/resources.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../dashboard/resources.html', import.meta.url), 'utf8');

test('Resources preserves PNG files and transparent thumbnails', () => {
  assert.equal((script.match(/if \(\['jpg', 'jpeg'\]\.includes\(ext\)\)/g) || []).length, 2);
  assert.equal((script.match(/else if \(ext === 'png'\) fileType = 'png'/g) || []).length, 2);
  assert.match(script, /file\.type === 'image\/png' \? 'image\/png' : 'image\/jpeg', 0\.7/);
  assert.equal((script.match(/thumbBlob\.type === 'image\/png' \? 'png' : 'jpg'/g) || []).length, 2);
  assert.match(page, /file-uploader" accept="[^"]*\.png/);
  assert.match(page, /resources\.js\?v=20260907-png-transparency/);
});
