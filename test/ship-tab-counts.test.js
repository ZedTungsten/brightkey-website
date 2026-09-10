import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const shared = read('dashboard/ship/tab-counts.js');
const migration = read('supabase/migrations/20260910025250_unify_ship_tab_counts.sql');
const pages = ['send', 'receive', 'done'].map(name => read(`dashboard/ship/${name}.html`));

test('all Ship pages use one authoritative badge renderer and cache version', () => {
  pages.forEach(page => {
    assert.match(page, /\/dashboard\/ship\/tab-counts\.js\?v=20260910-unified-tab-counts/);
    assert.match(page, /return window\.ShipTabCounts\.update\(\{ sb: window\.BKAuth\.sb, companyId: this\.companyId \}\)/);
    assert.doesNotMatch(page, /const sendCount =|const receiveCount =/);
  });
  assert.match(shared, /rpc\('get_ship_tab_counts'/);
  assert.match(shared, /requestKey = nextKey/);
  assert.match(shared, /render\('badge-count-send', row\.send_count\)/);
  assert.match(shared, /render\('badge-count-receive', row\.receive_count\)/);
});

test('Ship count RPC is company-scoped, module-authorized, and unavailable to anon', () => {
  assert.match(migration, /public\.has_module_access\(\(SELECT auth\.uid\(\)\), p_company_id, 'Logistics'\)/);
  assert.match(migration, /booking\.company_id = p_company_id/);
  assert.match(migration, /tx\.company_id = p_company_id/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_ship_tab_counts\(uuid\) FROM anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_ship_tab_counts\(uuid\) TO authenticated/);
});

test('Ship Send and Receive counts preserve their destination queue exclusions', () => {
  assert.match(migration, /booking\.order_no NOT LIKE 'OC-%'[\s\S]*?booking\.order_no NOT LIKE 'DO-%'/);
  assert.match(migration, /LOWER\(TRIM\(product\.category\)\) = 'service'/);
  assert.match(migration, /tx\.status = 'ordered'[\s\S]*?tx\.reference_id LIKE 'RCV-%'[\s\S]*?tx\.reference_id LIKE 'SUP-%'/);
  assert.match(migration, /NOT EXISTS \([\s\S]*?FROM public\.delivery_bookings AS delivery/);
});
