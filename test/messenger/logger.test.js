import test from 'node:test';
import assert from 'node:assert/strict';
import { logMessengerError } from '../../lib/messenger/logger.js';

test('structured error logging redacts secrets and tokens', () => {
  const original = console.error;
  let output = '';
  console.error = (line) => { output = line; };

  try {
    logMessengerError('test_failure', new Error('safe message'), {
      accessToken: 'never-log-this',
      nested: { app_secret: 'nor-this', pageId: 'page-1' }
    });
  } finally {
    console.error = original;
  }

  const parsed = JSON.parse(output);
  assert.equal(parsed.context.accessToken, '[REDACTED]');
  assert.equal(parsed.context.nested.app_secret, '[REDACTED]');
  assert.equal(parsed.context.nested.pageId, 'page-1');
  assert.equal(output.includes('never-log-this'), false);
});
