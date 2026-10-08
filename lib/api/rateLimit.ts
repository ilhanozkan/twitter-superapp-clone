export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next request would be allowed (0 when allowed). */
  retryAfter: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Track at most this many clients; beyond it the least recently seen are forgotten. */
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
  let lastPrune = 0;

  const prune = (time: number) => {
    lastPrune = time;
    hits.forEach((timestamps, key) => {
      const recent = timestamps.filter((t) => t > time - windowMs);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
    });
  };

  /** Makes room for a new key: drop expired keys (at most once per window), then the oldest. */
  const makeRoom = (time: number) => {
    if (time - lastPrune >= windowMs) prune(time);
    // Maps iterate in insertion order, so the first key is the oldest.
    while (hits.size >= maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
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

    if (!hits.has(key) && hits.size >= maxKeys) makeRoom(time);
    recent.push(time);
    // Re-insert so the Map's order tracks recent activity.
    hits.delete(key);
    hits.set(key, recent);
    return { allowed: true, retryAfter: 0 };
  };
}
