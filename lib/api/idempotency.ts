import type { NextApiRequest, NextApiResponse } from "next";

import { getCurrentUsername } from "../auth";
import type { IdempotentInput } from "../db/types";
import {
  fingerprint,
  IDEMPOTENCY_KEY_PATTERN,
  operationId,
  OperationScope,
} from "../superapp/idempotency";
import { invalid } from "./errors";
import { headerValue } from "./handler";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const REPLAYED_HEADER = "Idempotent-Replayed";

/**
 * The operation id and request fingerprint of a keyed write. The client
 * picks the `Idempotency-Key`; the id also depends on the acting user and
 * the scope, so keys never collide across users or kinds of operation.
 * `payload` is the validated body plus route params: reusing a key with a
 * different payload is refused (422) by the repository.
 */
export function parseIdempotency(
  req: NextApiRequest,
  {
    scope,
    prefix,
    payload,
  }: {
    scope: OperationScope;
    prefix: Parameters<typeof operationId>[0];
    payload: unknown;
  }
): IdempotentInput {
  const key = headerValue(req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]);
  if (!key) {
    throw invalid(
      IDEMPOTENCY_KEY_HEADER,
      "Send an Idempotency-Key header so a retry can't pay twice"
    );
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw invalid(
      IDEMPOTENCY_KEY_HEADER,
      "Idempotency-Key must be 8 to 64 letters, digits, - or _"
    );
  }

  return {
    operationId: operationId(prefix, getCurrentUsername(), scope, key),
    fingerprint: fingerprint(payload),
  };
}

/** Responds to a keyed write; a replay keeps the original status and says so in a header. */
export function sendMoneyResult<T>(
  res: NextApiResponse<T>,
  status: number,
  body: T,
  replayed: boolean
): void {
  if (replayed) res.setHeader(REPLAYED_HEADER, "true");
  res.status(status).json(body);
}
