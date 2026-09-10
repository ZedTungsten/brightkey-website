import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dashboard/ship/done.html', import.meta.url), 'utf8');
const helperStart = source.indexOf('function getDoneWorkflowStatus');
const helperEnd = source.indexOf('\n    function renderAuditedDate', helperStart);
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(helperStart, helperEnd), context);

test('Ship Done treats received timestamps and delivered bookings as received', () => {
  const status = context.getDoneWorkflowStatus;
  assert.equal(status({ status: 'reserved', timestamp_received: '2026-09-07T04:00:00Z' }), 'received');
  assert.equal(status({ status: 'reserved' }, { status: 'delivered' }), 'received');
  assert.equal(status({ status: 'reserved' }, { delivered_at: '2026-09-07T04:18:12Z' }), 'received');
});

test('Ship Done treats dispatch timestamps and picked-up bookings as dispatched', () => {
  const status = context.getDoneWorkflowStatus;
  assert.equal(status({ status: 'reserved', timestamp_dispatched: '2026-09-07T04:00:00Z' }), 'dispatched');
  assert.equal(status({ status: 'reserved' }, { status: 'picked_up' }), 'dispatched');
  assert.equal(status({ status: 'reserved' }, { picked_up_at: '2026-09-07T03:22:21Z' }), 'dispatched');
});

test('Ship Done applies authoritative workflow status while grouping and rendering', () => {
  assert.match(source, /deliveryByReference = new Map/);
  assert.match(source, /includes\(getDoneWorkflowStatus\(t, deliveryByReference\.get\(refId\)\)\)/);
  assert.match(source, /txs\.some\(t => getDoneWorkflowStatus\(t, db\) === 'received'\)/);
});
