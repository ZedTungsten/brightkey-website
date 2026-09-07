import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/logistics-calendar/calendar.html', import.meta.url), 'utf8');
const allOrders = fs.readFileSync(new URL('../dashboard/logistics-calendar/all-orders.html', import.meta.url), 'utf8');

test('Logistics Calendar excludes cancelled product transactions', () => {
  assert.match(page, /visibleTransactions\(transactions\)\s*\{[\s\S]*transaction\.status[\s\S]*!== 'cancelled'/);
  assert.match(page, /const txs = this\.visibleTransactions\(orderTransactions\)/);
  assert.match(page, /if \(orderTransactions\.length > 0 && txs\.length === 0\) return/);
  assert.match(page, /txs = this\.visibleTransactions\(liveTxsRes\.data\)/);
});

test('Logistics Calendar labels pre-packing orders as For Packing', () => {
  assert.match(page, /return 'For Packing'/);
  assert.match(page, /'For Packing': \{ bg: '#ef4444', color: '#fff' \}/);
  assert.doesNotMatch(page, /For QA/);
});

test('All Orders labels only cancelled SKUs and keeps an active order status', () => {
  assert.match(allOrders, /\.select\('order_no, scheduled_date, customer_address, customer_phone, status, products'\)/);
  assert.match(allOrders, /const cancelledQuantityBySku = new Map\(\)/);
  assert.match(allOrders, /if \(!item\.timestamp_cancelled\) return;[\s\S]*cancelledItemIds\.add\(item\.id\)/);
  assert.match(allOrders, /product\?\.cancelled !== true/);
  assert.match(allOrders, /const activeItems = group\.items\.filter\(item => !cancelledItemIds\.has\(item\.id\)\)/);
  assert.match(allOrders, /const isCancelledOrder = activeItems\.length === 0/);
  assert.match(allOrders, /cancelledItemIds\.has\(item\.id\) \? '<span class="badge-status badge-cancelled">Cancelled<\/span>'/);
  assert.match(allOrders, /if \(item\.timestamp_received\) return 'received'/);
  assert.match(allOrders, /orderStatus === 'reserved'[\s\S]*?\? 'For Packing'/);
  assert.match(allOrders, /\$\{escFulfillment\(orderStatusLabel\)\}/);
  assert.doesNotMatch(allOrders, /installationBooking\?\.status === 'cancelled' \|\| group\.items\.every/);
});

test('All Orders uses the requested workflow status colors', () => {
  assert.match(allOrders, /\.badge-reserved \{ background: #F97316; color: #FFFFFF;/);
  assert.match(allOrders, /\.badge-packed \{ background: var\(--cyan\); color: #FFFFFF;/);
  assert.match(allOrders, /\.badge-received \{ background: #22C55E; color: #FFFFFF;/);
  assert.match(allOrders, /\.badge-cancelled \{ background: #EF4444; color: #FFFFFF;/);
});

test('All Orders uses the canonical right-aligned month picker above the panel', () => {
  assert.match(allOrders, /class="orders-toolbar"[\s\S]*id="search-customer"[\s\S]*class="month-picker"[\s\S]*id="month-label"[\s\S]*class="panel"/);
  assert.match(allOrders, /\.orders-toolbar \{[^}]*justify-content: space-between;/);
  assert.match(allOrders, /\.month-picker button \{[^}]*width: 42px;[^}]*height: 42px;/);
  assert.match(allOrders, /\.month-picker-label \{[^}]*min-width: 130px;/);
  assert.match(allOrders, /month: 'long', year: 'numeric'/);
});
