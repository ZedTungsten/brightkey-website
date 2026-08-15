import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-stocks.html', import.meta.url), 'utf8');

test('Sales Stocks shows all company products except Service products', () => {
  assert.match(source, /\.eq\('company_id', currentCompanyId\)/);
  assert.match(source, /const sku = String\(p\.sku \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /const category = String\(p\.category \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /return sku !== 'service' && category !== 'service'/);
  assert.doesNotMatch(source, /p\.count_inventory !== false/);
  assert.doesNotMatch(source, /checkSkuEligibility/);
  assert.doesNotMatch(source, /commissions_config/);
});
