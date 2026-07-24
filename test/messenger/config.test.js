import test from 'node:test';
import assert from 'node:assert/strict';
import { getMessengerConfigStatus } from '../../lib/messenger/config.js';

test('configuration status reports only missing variable names', () => {
  const status = getMessengerConfigStatus({
    META_APP_ID: 'app',
    META_APP_SECRET: 'secret',
    META_WEBHOOK_VERIFY_TOKEN: '',
    META_GRAPH_API_VERSION: 'v23.0'
  });

  assert.equal(status.configured, false);
  assert.deepEqual(status.missing, ['META_WEBHOOK_VERIFY_TOKEN']);
  assert.equal(status.graphApiVersion, 'v23.0');
  assert.equal(JSON.stringify(status).includes('secret'), false);
});
