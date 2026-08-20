import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(currentDirectory, '..', 'dashboard', 'catalog-variants.js'), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const variants = context.globalThis.BKCatalogVariants;

function input() {
  const classes = new Set();
  return {
    value: '', disabled: false, readOnly: false, placeholder: '',
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    hasClass: value => classes.has(value)
  };
}

test('child variant category inherits from its exact parent and is read-only', () => {
  const field = input();
  variants.syncInput(field, {
    products: [{ id: 'parent', sku: 'G26 TT SLIDE', business: 'Smart Locks', variant_name: 'Door' }],
    editingId: 'child', business: 'Smart Locks', parentSku: 'g26 tt slide'
  });
  assert.equal(field.value, 'Door');
  assert.equal(field.readOnly, true);
  assert.equal(field.hasClass('inherited-value'), true);
});

test('child with a blank parent category shows the parent instruction', () => {
  const field = input();
  variants.syncInput(field, {
    products: [{ id: 'parent', sku: 'G26 TT SLIDE', business: 'Smart Locks', variant_name: null }],
    editingId: 'child', business: 'Smart Locks', parentSku: 'G26 TT SLIDE'
  });
  assert.equal(field.value, '');
  assert.equal(field.placeholder, 'Set in parent SKU');
  assert.equal(field.readOnly, true);
});
