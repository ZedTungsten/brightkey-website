import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/sales-goals.html', import.meta.url), 'utf8');

test('Sales Goals Orders uses the CS Customers viewport table pattern', () => {
  assert.match(source, /html\[data-sales-goals-tab="orders"\] \.goals-wrap \{[\s\S]*?padding: 1\.5rem 1\.5rem 4rem;/);
  assert.match(source, /\.orders-table-scroll \{[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(source, /\.orders-table th \{[\s\S]*?position: sticky;[\s\S]*?background: #F4F4F5;/);
  assert.match(source, /class="goals-panel orders-table-panel"/);
  assert.match(source, /class="prod-table orders-table"/);
  assert.match(source, /class="table-spacer-row"/);
});
