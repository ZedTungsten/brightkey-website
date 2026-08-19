import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidebar = fs.readFileSync(path.join(root, 'js/sidebar.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'database/migrations/07_optimizations.sql'),
  'utf8'
);

test('chat history uses bounded cursor pagination backed by the existing thread index', () => {
  assert.match(sidebar, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(sidebar, /\.order\('id', \{ ascending: false \}\)/);
  assert.match(sidebar, /\.limit\(this\.messagesLimit\)/);
  assert.match(sidebar, /created_at\.lt\.\$\{this\.messagesCursor\.createdAt\}/);
  assert.doesNotMatch(sidebar, /messagesOffset|\.range\(this\.messagesOffset/);
});

test('chat does not persist message previews or subscribe to operational table changes', () => {
  assert.doesNotMatch(sidebar, /chat_inbox_cache_|localStorage\.setItem\(cacheKey/);
  assert.doesNotMatch(sidebar, /\.on\('postgres_changes'/);
  assert.match(sidebar, /config: \{ private: true \}/);
  assert.match(sidebar, /removeChannel\(channel\)/);
});

test('active coworker selection and historical inbox participants remain merged', () => {
  assert.match(sidebar, /\.eq\('employment_status', 'Active'\)/);
  assert.match(sidebar, /inbox\.forEach\(thread => \{/);
  assert.match(sidebar, /if \(!teammatesMap\[thread\.other_employee_id\]\)/);
  assert.match(sidebar, /\.in\('employee_id', visibleEmployeeIds\)/);
});

test('database broadcasts are private, scoped, additive, and leave source rows intact', () => {
  assert.match(migration, /'employee:' \|\| NEW\.receiver_id::TEXT \|\| ':chat'/);
  assert.match(migration, /'company:' \|\| target_company_id::TEXT \|\| ':chat'/);
  assert.match(migration, /Chat participants can receive private broadcasts/);
  assert.match(migration, /SELECT public\.get_user_tenants\(\(SELECT auth\.uid\(\)\)\)/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
});
