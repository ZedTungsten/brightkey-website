import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../dashboard/logistics-calendar/calendar.html', import.meta.url), 'utf8');
const allOrders = fs.readFileSync(new URL('../dashboard/logistics-calendar/all-orders.html', import.meta.url), 'utf8');
const functionStart = page.indexOf('function getActiveOrderTransactions(transactions, booking) {');
assert.notEqual(functionStart, -1, 'Logistics cancellation helper must remain extractable');
let braceDepth = 0;
let functionEnd = -1;
for (let index = page.indexOf('{', functionStart); index < page.length; index += 1) {
  if (page[index] === '{') braceDepth += 1;
  if (page[index] === '}') braceDepth -= 1;
  if (braceDepth === 0) {
    functionEnd = index + 1;
    break;
  }
}
const logisticsActiveSource = page.slice(functionStart, functionEnd);
const logisticsActiveTransactions = vm.runInNewContext(`(${logisticsActiveSource})`);

globalThis.window = {};
await import('../dashboard/warehouse/shared.js');
const warehouseActiveTransactions = window.getActiveOrderTransactions;

test('Logistics Calendar excludes cancelled product transactions', () => {
  assert.match(page, /visibleTransactions\(transactions, booking\)\s*\{\s*return getActiveOrderTransactions\(transactions, booking\);/);
  assert.match(page, /const txs = this\.visibleTransactions\(orderTransactions, installationBooking\)/);
  assert.match(page, /if \(orderTransactions\.length > 0 && txs\.length === 0\) return/);
  assert.match(page, /txs = this\.visibleTransactions\(liveTxsRes\.data, ib\)/);
});

for (const [surface, getActiveTransactions] of [
  ['Warehouse', warehouseActiveTransactions],
  ['Logistics', logisticsActiveTransactions]
]) {
  test(`${surface} hides only cancelled products from a mixed order`, () => {
    const booking = {
      products: [
        { sku: 'G06B TT SWING', qty: 1 },
        { sku: 'A11 TT', qty: 1, cancelled: true }
      ]
    };
    const transactions = [
      { id: 'active-line', sku: 'G06B TT SWING', quantity: 1, status: 'reserved' },
      { id: 'cancelled-line', sku: 'A11 TT', quantity: 1, status: 'reserved' }
    ];

    assert.deepEqual(
      Array.from(getActiveTransactions(transactions, booking), transaction => transaction.id),
      ['active-line']
    );
  });

  test(`${surface} keeps an active duplicate SKU after one occurrence is cancelled`, () => {
    const booking = {
      products: [
        { sku: 'LOCK', qty: 1 },
        { sku: 'LOCK', qty: 1, cancelled: true }
      ]
    };
    const transactions = [
      { id: 'cancelled-occurrence', sku: 'LOCK', quantity: 1, status: 'cancelled', timestamp_cancelled: '2026-09-11T00:00:00Z' },
      { id: 'active-occurrence', sku: 'LOCK', quantity: 1, status: 'reserved' }
    ];

    assert.deepEqual(
      Array.from(getActiveTransactions(transactions, booking), transaction => transaction.id),
      ['active-occurrence']
    );
  });
}

test('Warehouse cancellation is scoped to its order when another order uses the same SKU', () => {
  const transactions = [
    { id: 'order-a-line', reference_id: 'ORD-A', sku: 'LOCK', quantity: 1, type: 'customer_order', status: 'packed', timestamp_packed: '2026-09-11T00:00:00Z' },
    { id: 'order-b-line', reference_id: 'ORD-B', sku: 'LOCK', quantity: 1, type: 'customer_order', status: 'packed', timestamp_packed: '2026-09-11T00:00:00Z' }
  ];
  const bookings = [
    { order_no: 'ORD-A', products: [{ sku: 'LOCK', qty: 1, cancelled: true }] },
    { order_no: 'ORD-B', products: [{ sku: 'LOCK', qty: 1 }] }
  ];

  assert.deepEqual(
    window.getDispatchableOrderTransactions(transactions, bookings, [{ sku: 'LOCK', count_inventory: true }])
      .map(transaction => transaction.id),
    ['order-b-line']
  );
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
