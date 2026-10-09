import { ApiErrorResponse } from "../../types/Api";

/** A non-2xx API response, carrying the server's error code and message. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface RequestOptions extends RequestInit {
  /**
   * Sent as the Idempotency-Key header. A keyed request is retried once,
   * with the same key, after a network error or a 409 `conflict`: the server
   * either finds the operation's record (a replay) or runs it again, so the
   * retry can never apply the operation twice.
   */
  idempotencyKey?: string;
  /** Resolve with `{ body, headers }` instead of the body alone. */
  withHeaders?: boolean;
}

export interface WithHeaders<T> {
  body: T;
  headers: Headers;
}

/** Worth one more try with the same key: the outcome is unknown or lost a race. */
const retryable = (error: ApiRequestError) =>
  error.code === "network_error" ||
  (error.status === 409 && error.code === "conflict");

async function send<T>(
  path: string,
  init: RequestInit
): Promise<WithHeaders<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      0,
      "network_error",
      "Check your connection and try again."
    );
  }

  if (response.status === 204) {
    return { body: undefined as T, headers: response.headers };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorResponse | null)?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? "Something went wrong. Try again.",
      error?.requestId
    );
  }
  return { body: body as T, headers: response.headers };
}

export function request<T>(
  path: string,
  options: RequestOptions & { withHeaders: true }
): Promise<WithHeaders<T>>;
export function request<T>(path: string, options?: RequestOptions): Promise<T>;
export async function request<T>(
  path: string,
  { idempotencyKey, withHeaders = false, ...init }: RequestOptions = {}
): Promise<T | WithHeaders<T>> {
  if (idempotencyKey) {
    init = {
      ...init,
      headers: { ...init.headers, "Idempotency-Key": idempotencyKey },
    };
  }

  let result: WithHeaders<T>;
  try {
    result = await send<T>(path, init);
  } catch (error) {
    if (
      !idempotencyKey ||
      !(error instanceof ApiRequestError) ||
      !retryable(error)
    ) {
      throw error;
    }
    result = await send<T>(path, init);
  }
  return withHeaders ? result : result.body;
}
