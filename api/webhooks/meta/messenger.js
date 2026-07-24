import { getWebhookVerifyToken } from '../../../lib/messenger/config.js';
import { processMessengerWebhook } from '../../../lib/messenger/event-processor.js';
import { readRawBody } from '../../../lib/messenger/http.js';
import { logMessengerError } from '../../../lib/messenger/logger.js';

export const config = {
  api: { bodyParser: false }
};

function verifyWebhook(req, res) {
  const mode = req.query?.['hub.mode'];
  const token = req.query?.['hub.verify_token'];
  const challenge = req.query?.['hub.challenge'];

  if (mode === 'subscribe' && token === getWebhookVerifyToken() && challenge !== undefined) {
    res.status(200);
    res.setHeader('Content-Type', 'text/plain');
    res.send(String(challenge));
    return;
  }

  res.status(403).json({ error: 'Webhook verification failed' });
}

async function receiveWebhook(req, res) {
  try {
    const rawBody = await readRawBody(req);
    req.rawBody = rawBody;

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    if (payload?.object !== 'page') {
      return res.status(404).json({ error: 'Unsupported webhook object' });
    }

    res.status(200).json({ received: true });

    try {
      await processMessengerWebhook(payload);
    } catch (error) {
      logMessengerError('webhook_processing_failed', error, {
        entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0
      });
    }
  } catch (error) {
    logMessengerError('webhook_request_failed', error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({ error: 'Unable to receive webhook' });
    }
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return verifyWebhook(req, res);
  if (req.method === 'POST') return receiveWebhook(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
