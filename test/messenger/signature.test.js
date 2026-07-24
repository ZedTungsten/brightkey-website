import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { isValidMessengerSignature } from '../../lib/messenger/signature.js';

test('signature validation uses the exact raw body bytes', () => {
  const secret = 'app-secret';
  const rawBody = Buffer.from('{"object":"page","entry":[]}');
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  assert.equal(isValidMessengerSignature(rawBody, signature, secret), true);
  assert.equal(
    isValidMessengerSignature(Buffer.from(`${rawBody.toString()} `), signature, secret),
    false
  );
});

test('signature validation rejects malformed values safely', () => {
  const rawBody = Buffer.from('{}');

  assert.equal(isValidMessengerSignature(rawBody, undefined, 'secret'), false);
  assert.equal(isValidMessengerSignature(rawBody, 'sha1=abc', 'secret'), false);
  assert.equal(isValidMessengerSignature(rawBody, 'sha256=not-hex', 'secret'), false);
  assert.equal(isValidMessengerSignature(rawBody, `sha256=${'0'.repeat(64)}`, ''), false);
});
