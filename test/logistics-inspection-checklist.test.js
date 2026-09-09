import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/settings/logistics.html', import.meta.url), 'utf8');

test('Logistics settings provides a five-item inspection checklist guide builder', () => {
  assert.match(page, /id="inspection-checklist-title"[^>]*>Inspection Checklist</);
  assert.match(page, /const MAX_INSPECTION_CHECKLIST_ITEMS = 5/);
  assert.match(page, /id="add-inspection-checklist-item"/);
  assert.match(page, /accept = 'image\/png,image\/jpeg,image\/gif,image\/webp'/);
});

test('Only checklist entries with both a label and safe guide image are persisted', () => {
  assert.match(page, /\.filter\(item => item\.label && item\.guide_url\)/);
  assert.match(page, /key: 'inspection_checklist'/);
  assert.match(page, /\.eq\('company_id', currentCompanyId\)[\s\S]*?\.eq\('key', 'inspection_checklist'\)/);
  assert.ok(page.includes('data:image\\/(?:png|jpe?g|gif|webp)'));
  assert.doesNotMatch(page, /warehouse\/inspected|inspect-complete-form/);
});

test('Logistics uses two columns and persists whether each checklist item is required', () => {
  assert.match(page, /grid-template-areas: "warehouses suppliers" "checklist suppliers"/);
  assert.match(page, /id="logistics-warehouses"/);
  assert.match(page, /id="logistics-suppliers"/);
  assert.match(page, /id="logistics-inspection-checklist"/);
  assert.match(page, /item\.required !== false/);
  assert.match(page, /requiredInput\.type = 'checkbox'/);
});
