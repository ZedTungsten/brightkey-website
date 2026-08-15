import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');

test('commission type columns render after order number and before city', () => {
  assert.match(source, /<td>\$\{escapeHtml\(b\.order_no \|\| '—'\)\}<\/td>\s*\$\{ratesCellsHtml\}\s*<td>\$\{escapeHtml\(city\)\}<\/td>/);
  assert.match(source, /th\.className = 'commission-type-column'/);
  assert.match(source, /\.commission-type-column\s*\{[\s\S]*?min-width:\s*260px;[\s\S]*?max-width:\s*none;/);
});

test('commission values and locked rows use the requested colors', () => {
  assert.match(source, /color: var\(--cyan-light\); font-size: 0\.78rem/);
  assert.match(source, /commission-row-locked[\s\S]*background: #f5fcf7 !important/);
  assert.match(source, /<tr class="\$\{b\.commissions_locked \? 'commission-row-locked' : ''\}">/);
});
