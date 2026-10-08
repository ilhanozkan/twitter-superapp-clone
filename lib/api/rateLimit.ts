export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next request would be allowed (0 when allowed). */
  retryAfter: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Stop tracking new keys past this many, so memory stays bounded. */
  maxKeys?: number;
}

/**
 * Sliding-window limiter kept in memory. It is per server instance, so on
 * serverless platforms it only slows down a single client hitting one
 * instance; put a shared store (e.g. Redis) behind this interface for more.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  const prune = (time: number) => {
    hits.forEach((timestamps, key) => {
      const recent = timestamps.filter((t) => t > time - windowMs);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
    });
  };

  return function check(key: string): RateLimitResult {
    const time = now();
    const recent = (hits.get(key) ?? []).filter((t) => t > time - windowMs);

    if (recent.length >= limit) {
      hits.set(key, recent);
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.ceil((recent[0] + windowMs - time) / 1000)
        ),
      };
    }

    if (!hits.has(key) && hits.size >= maxKeys) prune(time);
    recent.push(time);
    hits.set(key, recent);
    return { allowed: true, retryAfter: 0 };
  };
}
