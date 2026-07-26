import { createHash } from 'crypto';

export function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

export async function enforceRateLimit({
  supabase,
  req,
  res,
  scope,
  identifier = '',
  limit,
  windowSeconds
}) {
  const rawKey = `${requestIp(req)}:${identifier}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const { data, error } = await supabase.rpc('consume_api_rate_limit', {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) {
    console.error(`Rate limit check failed for ${scope}:`, error);
    res.status(503).json({ error: 'The request could not be verified. Please try again.' });
    return false;
  }
  if (data !== true) {
    res.setHeader('Retry-After', String(windowSeconds));
    res.status(429).json({ error: 'Too many requests. Wait a moment and try again.' });
    return false;
  }
  return true;
}
