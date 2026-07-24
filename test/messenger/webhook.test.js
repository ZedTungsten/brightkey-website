import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
  process.env.META_APP_SECRET = 'test-app-secret';
  return (await import('../../api/webhooks/meta/messenger.js')).default;
}

function signedRequest(body, signature) {
  const rawBody = Buffer.from(body);
  const req = Readable.from([rawBody]);
  req.method = 'POST';
  req.headers = {
    'x-hub-signature-256': signature || `sha256=${createHmac('sha256', process.env.META_APP_SECRET)
      .update(rawBody)
      .digest('hex')}`
  };
  return req;
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

test('POST accepts a valid signature', async () => {
  const handler = await loadHandler();
  const body = JSON.stringify({ object: 'page', entry: [] });
  const req = signedRequest(body);
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true });
  assert.deepEqual(req.rawBody, Buffer.from(body));
});

test('POST rejects an invalid signature', async () => {
  const handler = await loadHandler();
  const req = signedRequest(
    JSON.stringify({ object: 'page', entry: [] }),
    `sha256=${'0'.repeat(64)}`
  );
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Invalid webhook signature' });
});

test('POST rejects a missing signature', async () => {
  const handler = await loadHandler();
  const req = signedRequest(JSON.stringify({ object: 'page', entry: [] }));
  req.headers = {};
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test('POST rejects non-page webhook objects after signature validation', async () => {
  const handler = await loadHandler();
  const req = signedRequest(JSON.stringify({ object: 'user' }));
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Unsupported webhook object' });
  assert.ok(Buffer.isBuffer(req.rawBody));
});

test('POST rejects malformed JSON with a valid signature', async () => {
  const handler = await loadHandler();
  const req = signedRequest('{"object":"page"');
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid JSON payload' });
});

test('POST rejects payloads larger than one megabyte', async () => {
  const handler = await loadHandler();
  const req = Readable.from([Buffer.alloc(1_000_001, 97)]);
  req.method = 'POST';
  req.headers = {};
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, { error: 'Unable to receive webhook' });
});
