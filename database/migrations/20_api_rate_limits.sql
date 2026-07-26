CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_scope TEXT,
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.api_rate_limits AS rate_limit (
    scope,
    key_hash,
    window_start,
    request_count
  )
  VALUES (p_scope, p_key_hash, NOW(), 1)
  ON CONFLICT (scope, key_hash)
  DO UPDATE SET
    window_start = CASE
      WHEN rate_limit.window_start <= NOW() - make_interval(secs => p_window_seconds)
        THEN NOW()
      ELSE rate_limit.window_start
    END,
    request_count = CASE
      WHEN rate_limit.window_start <= NOW() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE rate_limit.request_count + 1
    END
  RETURNING request_count INTO current_count;

  RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
