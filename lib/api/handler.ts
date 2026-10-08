import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";

import { isReadOnly } from "../auth";
import { ConfigurationError, NotFoundError } from "../db/errors";
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

function writeLimiter() {
  const perMinute = Number(process.env.WRITE_RATE_LIMIT ?? 30);
  if (!(perMinute > 0)) return null;

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

/**
 * The client address used for rate limiting. Forwarding headers are only
 * trusted behind a proxy that sets them (TRUST_PROXY=true, or on Vercel);
 * otherwise any client could pick a new address for every request.
 */
export function clientAddress(
  req: NextApiRequest,
  env: Record<string, string | undefined> = process.env
): string {
  if (env.TRUST_PROXY === "true" || env.VERCEL === "1") {
    const realIp = headerValue(req.headers["x-real-ip"])?.trim();
    if (realIp) return realIp;

    const forwarded = headerValue(req.headers["x-forwarded-for"]);
    if (forwarded) return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Rejects writes from other sites. Browsers always send Origin on
 * cross-origin POST/PUT/DELETE requests; clients without one (curl, server
 * to server) are not a CSRF vector and are allowed.
 */
function assertSameOrigin(req: NextApiRequest) {
  const origin = headerValue(req.headers.origin);
  if (!origin) return;

  const host = (
    headerValue(req.headers["x-forwarded-host"]) ??
    headerValue(req.headers.host)
  )
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

function toApiError(error: unknown): ApiError {
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
                ? error.stack ?? error.message
                : String(error),
          })
        );
      }

      if (res.headersSent) return;

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
