import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/warehouse/receive.html', import.meta.url), 'utf8');
const shared = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260909042350_receive_unreceived_queue.sql', import.meta.url), 'utf8');
const statusMigration = fs.readFileSync(new URL('../supabase/migrations/20260909043756_allow_unreceived_inventory_transaction_status.sql', import.meta.url), 'utf8');

test('warehouse Receive loads and groups detached unreceived lines with quantity and issue date', () => {
  assert.match(page, /\['ordered', 'dispatched', 'returned', 'unreceived'\]/);
  assert.match(page, /const unreceivedTransactions = pending\.filter\(transaction => transaction\.status === 'unreceived'\)/);
  assert.match(page, />Unreceived</);
  assert.match(page, /Order issued:/);
  assert.match(page, /\$\{transaction\.quantity\}/);
});

test('unreceived item actions reassign or discard only the selected company-owned row', () => {
  assert.match(page, /class="btn btn-purple btn-sm"[^>]+>Include to Shipment</);
  assert.match(page, /class="btn btn-solid-danger btn-sm"[^>]+>Discard</);
  assert.match(page, /reference_id: targetReferenceId,[\s\S]*receive_readded: true/);
  assert.match(page, /\.eq\('company_id', companyId\)[\s\S]*\.eq\('id', transaction\.id\)[\s\S]*\.eq\('status', 'unreceived'\)/);
  assert.match(page, /status: 'discarded'/);
});

test('re-added lines render last with the cyan outlined provenance pill', () => {
  assert.match(page, /Number\(Boolean\(a\.receive_readded\)\) - Number\(Boolean\(b\.receive_readded\)\)/);
  assert.match(page, /class="readded-pill">Re-added</);
  assert.match(page, /\.readded-pill[^}]+border: 1px solid var\(--cyan\)[^}]+background: #fff[^}]+color: var\(--cyan\)/);
});

test('migration preserves original shipment provenance and indexes the unreceived queue', () => {
  assert.match(migration, /unreceived_at timestamptz/);
  assert.match(migration, /unreceived_original_reference_id text/);
  assert.match(migration, /unreceived_original_supplier_name text/);
  assert.match(migration, /receive_readded boolean not null default false/);
  assert.match(migration, /where status = 'unreceived'/);
});

test('shared Receive badge includes unreceived lines without changing zero-badge behavior', () => {
  assert.match(shared, /const getUnreceivedCount = \(\) =>/);
  assert.match(shared, /Number\(row\.receive_count \|\| 0\) \+ getUnreceivedCount\(\)/);
  assert.match(shared, /if \(t\.status === 'unreceived'\) return true/);
});

test('transaction status constraint preserves existing values and permits unreceived workflow values', () => {
  for (const status of ['ordered', 'received', 'inspect', 'reserved', 'packed', 'dispatched', 'returned', 'cancelled', 'unreceived', 'discarded']) {
    assert.match(statusMigration, new RegExp(`'${status}'`));
  }
  assert.match(statusMigration, /validate constraint inventory_transactions_status_check/);
});
