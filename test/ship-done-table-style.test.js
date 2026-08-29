import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../dashboard/ship/done.html', import.meta.url), 'utf8');

test('Ship Done uses the compact CS Customers table structure', () => {
  assert.match(source, /\.panel \{[\s\S]*?border-radius: 10px;[\s\S]*?flex: 1;/);
  assert.match(source, /\.table-responsive \{[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(source, /thead th \{[\s\S]*?position: sticky;[\s\S]*?background: #F4F4F5;/);
  assert.match(source, /class="done-money-column">Total/);
  assert.match(source, /class="done-status \$\{esc\(order\.status\)\}"/);
  assert.match(source, /spacer\.className = 'table-spacer-row'/);
});

test('Ship Done uses one shared search-field component without nested input styling', () => {
  assert.match(source, /class="bk-search-field done-search"/);
  assert.match(source, /<svg viewBox="0 0 24 24" aria-hidden="true">[\s\S]*?<input type="search" id="search-done"/);
  assert.doesNotMatch(source, /class="bk-search-control" id="search-done"/);
});

test('Ship Done constrains the table panel to the viewport', () => {
  assert.match(source, /\.dash-layout,[\s\S]*?\.dash-main \{[\s\S]*?height: 100dvh;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(source, /\.content-area \{[\s\S]*?flex: 1;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(source, /\.main-panel \{[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(source, /\.done-toolbar \{[\s\S]*?flex-shrink: 0;/);
});

test('Ship Done positions date navigation right and Bulk Edit across from the page title', () => {
  const toolbar = source.match(/<div class="done-toolbar">([\s\S]*?)\n\s*<\/div>\n\n\s*<div class="panel">/)?.[1] || '';
  assert.ok(toolbar.indexOf('bk-search-field done-search') < toolbar.indexOf('month-nav-container'));
  assert.match(source, /\.done-toolbar \.month-nav-container \{\s*margin-left: auto;/);
  assert.match(source, /<div class="top-bar">[\s\S]*?<span class="top-bar-title">Logistics Ship<\/span>[\s\S]*?<div class="top-bar-actions">[\s\S]*?id="btn-bulk-fees"/);
  assert.doesNotMatch(source, /panel-header-actions/);
});

test('Ship Done totals every delivery fee column for the visible rows', () => {
  assert.match(source, /const feeTotals = this\.consolidatedOrders\.reduce/);
  assert.match(source, /totals\.base \+= Number\(order\.db\?\.base_fee\)/);
  assert.match(source, /totals\.tip1 \+= Number\(order\.db\?\.tip_1\)/);
  assert.match(source, /totals\.tip2 \+= Number\(order\.db\?\.tip_2\)/);
  assert.match(source, /totals\.toll \+= Number\(order\.db\?\.toll\)/);
  assert.match(source, /totalRow\.className = 'done-total-row'/);
  assert.match(source, /formatFeeTotal\(feeTotals\.total\)/);
});
