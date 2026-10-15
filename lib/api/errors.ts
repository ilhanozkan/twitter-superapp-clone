export type ErrorCode =
  | "bad_request"
  | "validation_error"
  | "forbidden"
  | "read_only"
  | "not_found"
  | "method_not_allowed"
  | "unsupported_media_type"
  | "rate_limited"
  | "internal_error"
  | "service_unavailable"
  | "insufficient_funds"
  | "wallet_frozen"
  | "limit_exceeded"
  | "unavailable"
  | "idempotency_key_reused"
  | "invalid_state"
  | "price_changed"
  | "conflict"
  | "not_implemented";

export interface ValidationIssue {
  /** Dotted path of the offending field, e.g. "text" or "image". */
  path: string;
  message: string;
}

/** An error the API reports to the client as-is (status, code and message). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ValidationIssue[],
    /** Sent with the error response, e.g. Retry-After. */
    readonly headers?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (message = "Not found") =>
  new ApiError(404, "not_found", message);

export const forbidden = (message: string) =>
  new ApiError(403, "forbidden", message);

/** A 400 for one field, shaped like the errors of schema validation. */
export const invalid = (path: string, message: string) =>
  new ApiError(400, "validation_error", "The request is invalid", [
    { path, message },
  ]);

export const rateLimited = (retryAfterSeconds: number) =>
  new ApiError(429, "rate_limited", "Too many requests, slow down", undefined, {
    "Retry-After": String(retryAfterSeconds),
  });
