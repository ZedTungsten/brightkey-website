import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/warehouse/receive.html', import.meta.url), 'utf8');

test('warehouse Receive enables a shipment when at least one pending item is checked', () => {
  assert.match(page, /function shipmentHasCheckedItems\(transactions\)\s*{\s*return transactions\.some/);
  assert.match(page, /button\.disabled = !shipmentHasCheckedItems\(group\)/);
  assert.doesNotMatch(page, /Check every item in this shipment before receiving it/);
});

test('partial receipt updates only selected transaction ids and detaches unchecked lines as unreceived', () => {
  assert.match(page, /currentReceivingShipmentTransactions = pendingShipmentTransactions\.filter\(transaction => checkedReceiveTransactions\.has\(transaction\.id\)\)/);
  assert.match(page, /\.in\('id', transactions\.map\(transaction => transaction\.id\)\)/);
  assert.match(page, /status: 'unreceived',[\s\S]*reference_id: null,[\s\S]*unreceived_original_reference_id: refId/);
  assert.match(page, /\.in\('id', currentReceivingUnselectedTransactions\.map\(transaction => transaction\.id\)\)/);
  assert.match(page, /bookingUpdate\.status = 'delivered'/);
  assert.match(page, /Unchecked items moved to Unreceived/);
});
