import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/products-gallery.js', import.meta.url), 'utf8');

test('feature business selection scopes results only when a feature checkbox is active', () => {
  assert.match(source, /const matchesFeatureBusiness = state\.selectedFeatures\.size === 0\s*\|\| product\.business === state\.featureBusiness/);
  assert.match(source, /matchesSearch && matchesCategory && matchesFeatureBusiness && matchesPrice && matchesFeatures/);
  assert.doesNotMatch(source, /const matchesBusiness = !state\.featureBusiness/);
});
