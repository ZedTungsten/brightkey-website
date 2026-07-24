import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(body) { this.body = body; this.headersSent = true; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; }
  };
}

async function loadHandler() {
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  return (await import('../../api/webhooks/meta/messenger.js')).default;
}

test('GET returns the exact challenge as plain text for valid verification', async () => {
  const handler = await loadHandler();
  const res = response();
  await handler({
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify-me',
      'hub.challenge': '001234'
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '001234');
  assert.equal(res.headers['Content-Type'], 'text/plain');
});

test('GET rejects invalid verification', async () => {
  const handler = await loadHandler();
  const res = response();
  await handler({
    method: 'GET',
    query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' }
  }, res);

  assert.equal(res.statusCode, 403);
});

test('POST rejects non-page webhook objects', async () => {
  const handler = await loadHandler();
  const req = Readable.from([JSON.stringify({ object: 'user' })]);
  req.method = 'POST';
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Unsupported webhook object' });
  assert.ok(Buffer.isBuffer(req.rawBody));
});
