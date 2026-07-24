const SENSITIVE_KEY_PATTERN = /(secret|token|authorization|signature)/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(item)
    ])
  );
}

export function logMessengerError(event, error, context = {}) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'meta-messenger',
    event,
    message: error instanceof Error ? error.message : String(error),
    context: redact(context),
    timestamp: new Date().toISOString()
  }));
}
