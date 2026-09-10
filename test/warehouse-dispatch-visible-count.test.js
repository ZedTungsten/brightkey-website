import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shared = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const dispatch = fs.readFileSync(new URL('../dashboard/warehouse/dispatch.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260910021537_unify_warehouse_tab_counts.sql', import.meta.url), 'utf8');

test('Dispatch table keeps its visible-order predicate while its badge uses the authoritative RPC', () => {
  assert.match(shared, /window\.getDispatchableOrderTransactions = function/);
  assert.match(shared, /window\.getInventoryTransactionWorkflowStatus\(transaction\) !== 'packed'/);
  assert.match(shared, /Number\(row\.dispatch_count \|\| 0\)/);
  assert.doesNotMatch(shared, /visibleDispatchOrderCount/);
  assert.match(dispatch, /const dispatchQueue = window\.getDispatchableOrderTransactions\(activeTransactions, bookings, allProducts\)/);
  assert.match(dispatch, /const bookingByOrder = new Map\(bookings\.map\(booking => \[booking\.order_no, booking\]\)\)/);
  assert.doesNotMatch(dispatch, /WarehousePage\.visibleDispatchOrderCount/);
  assert.match(dispatch, /shared\.js\?v=20260910-unified-tab-counts/);
  assert.match(migration, /COUNT\(DISTINCT tx\.reference_id\)[\s\S]*?tx\.status = 'packed'[\s\S]*?tx\.timestamp_dispatched IS NULL/);
});

test('already dispatched or received rows cannot inflate Dispatch count', () => {
  assert.match(shared, /if \(transaction\?\.timestamp_received\) return 'received'/);
  assert.match(shared, /if \(transaction\?\.timestamp_dispatched\) return 'dispatched'/);
});
