import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/sales-commissions.html', import.meta.url), 'utf8');

test('commissions table filters orders and commission names by salesperson', () => {
  assert.match(source, /for="sales-name-filter"[^>]*>Sales Name:<\/label>/);
  assert.match(source, /id="sales-name-filter"/);
  assert.match(source, /isAssignedToSelectedSales/);
  assert.match(source, /visibleAssignedIds/);
  assert.match(source, /employeeId !== selectedSalesId/);
  assert.doesNotMatch(source, /id="assign-filter"/);
});

test('commission controls follow the requested header and table-toolbar order', () => {
  const topBar = source.slice(source.indexOf('<header class="top-bar"'), source.indexOf('</header>'));
  const tableToolbar = source.slice(source.indexOf('<div class="panel-header"'), source.indexOf('<div class="table-responsive">'));

  assert.ok(topBar.indexOf('id="bulk-edit-container"') < topBar.indexOf('id="btn-save-assignments"'));
  assert.ok(tableToolbar.indexOf('id="sales-name-filter"') < tableToolbar.indexOf('class="month-nav-container"'));
  assert.doesNotMatch(tableToolbar, /id="bulk-edit-container"/);
});
