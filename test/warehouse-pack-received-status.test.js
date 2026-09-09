import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const shared = fs.readFileSync(new URL('../dashboard/warehouse/shared.js', import.meta.url), 'utf8');
const pack = fs.readFileSync(new URL('../dashboard/warehouse/pack.html', import.meta.url), 'utf8');

test('warehouse workflow status uses the same timestamp precedence as All Orders', () => {
  const start = shared.indexOf('window.getInventoryTransactionWorkflowStatus');
  const end = shared.indexOf('\n};', start) + 3;
  const context = { window: {} };
  vm.runInNewContext(shared.slice(start, end), context);
  const status = context.window.getInventoryTransactionWorkflowStatus;

  assert.equal(status({ status: 'reserved', timestamp_received: '2026-09-09T12:00:00Z' }), 'received');
  assert.equal(status({ status: 'inspect', timestamp_dispatched: '2026-09-08T12:00:00Z' }), 'dispatched');
  assert.equal(status({ status: 'reserved', timestamp_packed: '2026-09-07T12:00:00Z' }), 'packed');
  assert.equal(status({ status: 'inspect', timestamp_inspect: '2026-09-06T12:00:00Z' }), 'inspect');
});

test('Pack queue, Pack action, and Pack badge use authoritative workflow status', () => {
  assert.match(pack, /const workflowStatus = window\.getInventoryTransactionWorkflowStatus\(transaction\)/);
  assert.match(pack, /includes\(window\.getInventoryTransactionWorkflowStatus\(t\)\)/);
  assert.match(shared, /const getPackCount = \(\) =>[\s\S]*window\.getInventoryTransactionWorkflowStatus\(transaction\)/);
  assert.match(pack, /shared\.js\?v=20260910-authoritative-workflow-status/);
});
