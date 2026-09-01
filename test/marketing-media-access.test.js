import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../database/migrations/08_shared_media_access.sql', import.meta.url),
  'utf8'
);

test('Shared Media exposes only a narrow authenticated media RPC', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_shared_media_bookings/);
  assert.match(migration, /has_module_access\(\(SELECT auth\.uid\(\)\), p_company_id, 'Marketing'\)/);
  assert.match(migration, /has_module_access\(\(SELECT auth\.uid\(\)\), p_company_id, 'Sales'\)/);
  assert.match(migration, /booking\.company_id = p_company_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_shared_media_bookings[\s\S]*FROM PUBLIC, anon/);
  assert.doesNotMatch(migration, /CREATE POLICY|ALTER POLICY/);
});
