const REQUIRED_META_ENV = [
  'META_APP_ID',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'META_GRAPH_API_VERSION'
];

export function getMessengerConfigStatus(env = process.env) {
  const missing = REQUIRED_META_ENV.filter((name) => !env[name]?.trim());

  return {
    configured: missing.length === 0,
    missing,
    graphApiVersion: env.META_GRAPH_API_VERSION?.trim() || null
  };
}

export function getWebhookVerifyToken(env = process.env) {
  return env.META_WEBHOOK_VERIFY_TOKEN || '';
}
