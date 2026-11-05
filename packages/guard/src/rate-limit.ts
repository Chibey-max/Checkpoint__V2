import type { MiddlewareHandler } from 'hono';

/** Token bucket per key: `limit` requests per `windowMs`, refilled continuously (FR-R09: 30/min/IP). */
export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  key: (c: Parameters<MiddlewareHandler>[0]) => string;
  now?: () => number;
}): MiddlewareHandler {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { tokens: number; at: number }>();
  const rate = opts.limit / opts.windowMs;
  return async (c, next) => {
    const k = opts.key(c);
    const t = now();
    const b = buckets.get(k) ?? { tokens: opts.limit, at: t };
    b.tokens = Math.min(opts.limit, b.tokens + (t - b.at) * rate);
    b.at = t;
    if (b.tokens < 1) {
      buckets.set(k, b);
      const retry = Math.ceil((1 - b.tokens) / rate / 1000);
      c.header('retry-after', String(retry));
      return c.json(
        { code: 'RATE_LIMITED', message: `Rate limit: ${opts.limit} requests per minute.` },
        429,
      );
    }
    b.tokens -= 1;
    buckets.set(k, b);
    if (buckets.size > 10_000) {
      for (const [key, v] of buckets) if (t - v.at > opts.windowMs) buckets.delete(key);
    }
    await next();
  };
}
