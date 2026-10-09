import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";

import { envFlag, isReadOnly } from "../auth";
import {
  ConfigurationError,
  ConflictError,
  ForbiddenError,
  IdempotencyKeyReusedError,
  InsufficientFundsError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  NotImplementedError,
  PriceChangedError,
  UnavailableError,
  WalletFrozenError,
} from "../db/errors";
import { ApiError, ErrorCode, ValidationIssue } from "./errors";
import { createRateLimiter } from "./rateLimit";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

type RouteHandler = (req: NextApiRequest, res: NextApiResponse) => unknown;

export type Routes = Partial<Record<Method, RouteHandler>>;

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ValidationIssue[];
    requestId: string;
  };
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Kept on globalThis: Next.js bundles every API route separately, and a
// module-level limiter would give each route its own budget.
const globalLimiters = globalThis as typeof globalThis & {
  __superappWriteLimiters?: Map<number, ReturnType<typeof createRateLimiter>>;
};

const DEFAULT_WRITES_PER_MINUTE = 30;

/** WRITE_RATE_LIMIT: unset, empty or invalid fall back to the default; only "0" disables. */
export function writesPerMinute(value = process.env.WRITE_RATE_LIMIT): number {
  if (value === undefined || value.trim() === "")
    return DEFAULT_WRITES_PER_MINUTE;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_WRITES_PER_MINUTE;
}

function writeLimiter() {
  const perMinute = writesPerMinute();
  if (perMinute === 0) return null;

  const limiters = (globalLimiters.__superappWriteLimiters ??= new Map());
  let limiter = limiters.get(perMinute);
  if (!limiter) {
    limiter = createRateLimiter({ limit: perMinute, windowMs: 60_000 });
    limiters.set(perMinute, limiter);
  }
  return limiter;
}

export function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type Env = Record<string, string | undefined>;

/** Forwarding headers are only believed behind a proxy: TRUST_PROXY, or on Vercel. */
function trustsProxy(env: Env) {
  return envFlag(env.TRUST_PROXY) || env.VERCEL === "1";
}

/**
 * The client address used for rate limiting. Forwarding headers are only
 * trusted behind a proxy, and only the parts that proxy controls:
 * - on Vercel, X-Real-IP, which the platform sets and clients cannot;
 * - with TRUST_PROXY, the right-most X-Forwarded-For entry, which is the
 *   address the proxy itself saw (entries to its left come from the client).
 * Otherwise any client could pick a new address for every request.
 */
export function clientAddress(
  req: NextApiRequest,
  env: Env = process.env
): string {
  if (env.VERCEL === "1") {
    const realIp = headerValue(req.headers["x-real-ip"])?.trim();
    if (realIp) return realIp;
  }
  if (trustsProxy(env)) {
    const hops = headerValue(req.headers["x-forwarded-for"])
      ?.split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops?.length) return hops[hops.length - 1];
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Rejects writes from other sites. Browsers always send Origin on
 * cross-origin POST/PUT/DELETE requests; clients without one (curl, server
 * to server) are not a CSRF vector and are allowed. Behind a proxy, the proxy
 * must pass the original Host on, or set X-Forwarded-Host with TRUST_PROXY.
 */
function assertSameOrigin(req: NextApiRequest, env: Env = process.env) {
  const origin = headerValue(req.headers.origin);
  if (!origin) return;

  const forwardedHost = trustsProxy(env)
    ? headerValue(req.headers["x-forwarded-host"])
    : undefined;
  const host = (forwardedHost ?? headerValue(req.headers.host))
    ?.split(",")[0]
    .trim();

  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // "null" origins (sandboxed frames, file://) are rejected below.
  }

  if (!host || originHost !== host) {
    throw new ApiError(
      403,
      "forbidden",
      "Cross-origin requests are not allowed"
    );
  }
}

// Domain errors whose message is written for people and safe to show.
const DOMAIN_ERRORS: [new (...args: never[]) => Error, number, ErrorCode][] = [
  [InsufficientFundsError, 402, "insufficient_funds"],
  [WalletFrozenError, 403, "wallet_frozen"],
  [ForbiddenError, 403, "forbidden"],
  [LimitExceededError, 422, "limit_exceeded"],
  [IdempotencyKeyReusedError, 422, "idempotency_key_reused"],
  [InvalidStateError, 409, "invalid_state"],
  [PriceChangedError, 409, "price_changed"],
  [ConflictError, 409, "conflict"],
  [NotImplementedError, 501, "not_implemented"],
];

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "validation_error",
      "The request is invalid",
      error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }))
    );
  }
  if (error instanceof NotFoundError)
    return new ApiError(404, "not_found", error.message);
  if (error instanceof ConfigurationError) {
    return new ApiError(503, "service_unavailable", error.message);
  }
  if (error instanceof UnavailableError) {
    return new ApiError(
      422,
      "unavailable",
      error.message,
      error.productIds.map((id) => ({ path: "productId", message: id }))
    );
  }
  for (const [type, status, code] of DOMAIN_ERRORS) {
    if (error instanceof type) return new ApiError(status, code, error.message);
  }
  return new ApiError(500, "internal_error", "Something went wrong");
}

/**
 * Wraps API routes with what every endpoint needs: method routing (405 with
 * an Allow header, OPTIONS and HEAD), same-origin and rate-limit checks on
 * writes, a request id, and one JSON error shape:
 * `{ error: { code, message, details?, requestId } }`.
 */
export function createHandler(routes: Routes) {
  const methods = Object.keys(routes) as Method[];
  const allow = [...methods, ...(routes.GET ? ["HEAD"] : []), "OPTIONS"].join(
    ", "
  );

  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const incomingId = headerValue(req.headers["x-request-id"]);
    const requestId =
      incomingId && REQUEST_ID.test(incomingId) ? incomingId : randomUUID();
    res.setHeader("X-Request-Id", requestId);

    const method = (req.method ?? "GET").toUpperCase();

    try {
      if (method === "OPTIONS") {
        res.setHeader("Allow", allow);
        res.status(204).end();
        return;
      }

      const route = method === "HEAD" ? routes.GET : routes[method as Method];
      if (!route) {
        res.setHeader("Allow", allow);
        throw new ApiError(
          405,
          "method_not_allowed",
          `${method} is not allowed here`
        );
      }

      if (WRITE_METHODS.has(method)) {
        res.setHeader("Cache-Control", "no-store");
        if (isReadOnly()) {
          throw new ApiError(403, "read_only", "This site is read-only");
        }
        assertSameOrigin(req);

        const limit = writeLimiter()?.(clientAddress(req));
        if (limit && !limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfter));
          throw new ApiError(
            429,
            "rate_limited",
            "Too many requests, slow down"
          );
        }
      }

      await route(req, res);
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.status >= 500) {
        console.error(
          JSON.stringify({
            level: "error",
            requestId,
            method,
            url: req.url,
            status: apiError.status,
            error:
              error instanceof Error
                ? (error.stack ?? error.message)
                : String(error),
          })
        );
      }

      if (res.headersSent) return;
      // Error responses must never be cached, whatever the route set before.
      res.setHeader("Cache-Control", "no-store");

      const body: ApiErrorBody = {
        error: {
          code: apiError.code,
          message: apiError.message,
          ...(apiError.details ? { details: apiError.details } : {}),
          requestId,
        },
      };
      res.status(apiError.status).json(body);
    }
  };
}
