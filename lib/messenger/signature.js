import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export function isValidMessengerSignature(rawBody, receivedSignature, appSecret) {
  if (
    !Buffer.isBuffer(rawBody)
    || typeof receivedSignature !== 'string'
    || !receivedSignature.startsWith(SIGNATURE_PREFIX)
    || !appSecret
  ) {
    return false;
  }

  const receivedHex = receivedSignature.slice(SIGNATURE_PREFIX.length);
  if (!/^[a-fA-F0-9]{64}$/.test(receivedHex)) return false;

  const received = Buffer.from(receivedHex, 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();

  return received.length === expected.length && timingSafeEqual(received, expected);
}
