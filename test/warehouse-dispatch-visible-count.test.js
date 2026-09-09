import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shared = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const dispatch = fs.readFileSync(new URL('../dashboard/warehouse/dispatch.html', import.meta.url), 'utf8');

test('Dispatch table and badge share one visible-order predicate', () => {
  assert.match(shared, /window\.getDispatchableOrderTransactions = function/);
  assert.match(shared, /window\.getInventoryTransactionWorkflowStatus\(transaction\) !== 'packed'/);
  assert.match(shared, /Number\.isInteger\(this\.visibleDispatchOrderCount\)/);
  assert.match(shared, /return \[\.\.\.new Set\(window\.getDispatchableOrderTransactions/);
  assert.match(dispatch, /const dispatchQueue = window\.getDispatchableOrderTransactions\(activeTransactions, bookings, allProducts\)/);
  assert.match(dispatch, /const bookingByOrder = new Map\(bookings\.map\(booking => \[booking\.order_no, booking\]\)\)/);
  assert.match(dispatch, /WarehousePage\.visibleDispatchOrderCount = orderGroups\.length/);
  assert.match(dispatch, /shared\.js\?v=20260910-dispatch-visible-count-2/);
});

test('already dispatched or received rows cannot inflate Dispatch count', () => {
  assert.match(shared, /if \(transaction\?\.timestamp_received\) return 'received'/);
  assert.match(shared, /if \(transaction\?\.timestamp_dispatched\) return 'dispatched'/);
});
