import { rateLimited } from "./errors";
import { writesPerMinute } from "./handler";
import { createRateLimiter } from "./rateLimit";

// Budgets per acting user, on top of the per-client write limit: they slow
// down one account however many addresses it writes from. Without sign-in
// every visitor acts as the same user, so on a public deployment they
// protect the deployment as a whole.

export type ActorBucket =
  "money" | "messages" | "stories" | "channels" | "demoOrders";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const ACTOR_LIMITS: Record<
  ActorBucket,
  { limit: number; windowMs: number }
> = {
  money: { limit: 12, windowMs: MINUTE },
  messages: { limit: 30, windowMs: MINUTE },
  stories: { limit: 10, windowMs: HOUR },
  channels: { limit: 5, windowMs: HOUR },
  demoOrders: { limit: 5, windowMs: HOUR },
};

// Kept on globalThis like the write limiters: Next.js bundles every API
// route separately, and module-level limiters would give each its own budget.
const globalLimiters = globalThis as typeof globalThis & {
  __superappActorLimiters?: Map<
    ActorBucket,
    ReturnType<typeof createRateLimiter>
  >;
};

/**
 * Spends one request of `actor`'s `bucket`, or throws 429 `rate_limited`
 * with Retry-After once it is used up. WRITE_RATE_LIMIT=0 turns these off
 * too (the e2e suite). Call it after validation, right before the write, so
 * rejected requests don't use the budget.
 */
export function assertActorLimit(bucket: ActorBucket, actor: string): void {
  if (writesPerMinute() === 0) return;

  const limiters = (globalLimiters.__superappActorLimiters ??= new Map());
  let limiter = limiters.get(bucket);
  if (!limiter) {
    limiter = createRateLimiter(ACTOR_LIMITS[bucket]);
    limiters.set(bucket, limiter);
  }

  const result = limiter(actor.toLowerCase());
  if (!result.allowed) throw rateLimited(result.retryAfter);
}
