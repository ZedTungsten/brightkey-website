import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const catalog = fs.readFileSync(new URL('../dashboard/catalog.js', import.meta.url), 'utf8');

test('every successful catalog mutation marks the site as unpublished', () => {
  assert.match(catalog, /function markUnpublishedChanges\(\)[\s\S]*hasSessionUnpublishedChanges = true;[\s\S]*updatePublishStateUI\(\)/);
  assert.match(catalog, /hasUnpublishedChanges = hasSessionUnpublishedChanges \|\| allProducts\.some/);
  assert.match(catalog, /Updated \$\{selectedProductIds\.length\} products successfully![\s\S]*await fetchProducts/);
  assert.match(catalog, /markUnpublishedChanges\(\);\s*toast\(editingId \? 'Product updated!' : 'Product created!'/);
  assert.match(catalog, /from\('products'\)\.delete\(\)[\s\S]*markUnpublishedChanges\(\)/);
  assert.match(catalog, /refreshAfterSave\([\s\S]*markUnpublishedChanges/);
  assert.match(catalog, /markUnpublishedChanges\(\);\s*toast\('Prices restored successfully!'/);
  assert.match(catalog, /markUnpublishedChanges\(\);\s*toast\('Prices updated successfully!'/);
});

test('publishing clears the current-session unpublished marker', () => {
  assert.match(catalog, /last_published_at[\s\S]*hasSessionUnpublishedChanges = false;[\s\S]*hasUnpublishedChanges = false;/);
});
