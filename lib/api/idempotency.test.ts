import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubDefaultEnv } from "../../test/api";
import { fingerprint, operationId } from "../superapp/idempotency";
import { ApiError } from "./errors";
import { parseIdempotency, sendMoneyResult } from "./idempotency";

const request = (headers: Record<string, string> = {}) =>
  ({ headers }) as unknown as NextApiRequest;

const options = {
  scope: "wallet.send",
  prefix: "tx",
  payload: { to: "sarahcodes", amount: 250, note: null },
} as const;

beforeEach(() => stubDefaultEnv());
afterEach(() => vi.unstubAllEnvs());

describe("parseIdempotency", () => {
  it("derives the operation id from the actor, scope and key", () => {
    const key = "0b6f6a43-2c1e-4b1c-9d55-1f2b3c4d5e6f";
    const parsed = parseIdempotency(
      request({ "idempotency-key": key }),
      options
    );

    expect(parsed).toEqual({
      operationId: operationId("tx", "illlhanozkan", "wallet.send", key),
      fingerprint: fingerprint(options.payload),
    });
    expect(parsed.operationId).toMatch(/^tx-[0-9a-f]{32}$/);

    vi.stubEnv("DEMO_USERNAME", "sarahcodes");
    expect(
      parseIdempotency(request({ "idempotency-key": key }), options).operationId
    ).toBe(operationId("tx", "sarahcodes", "wallet.send", key));
  });

  it("fingerprints the payload whatever its key order", () => {
    const key = { "idempotency-key": "abcdefgh" };
    const a = parseIdempotency(request(key), {
      ...options,
      payload: { amount: 250, to: "sarahcodes", note: undefined },
    });
    const b = parseIdempotency(request(key), {
      ...options,
      payload: { to: "sarahcodes", amount: 250 },
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it.each([
    [undefined, "Send an Idempotency-Key header so a retry can't pay twice"],
    ["", "Send an Idempotency-Key header so a retry can't pay twice"],
    ["short", "Idempotency-Key must be 8 to 64 letters, digits, - or _"],
    [
      "has spaces in it",
      "Idempotency-Key must be 8 to 64 letters, digits, - or _",
    ],
    ["a.b.c.d.e.f", "Idempotency-Key must be 8 to 64 letters, digits, - or _"],
    ["x".repeat(65), "Idempotency-Key must be 8 to 64 letters, digits, - or _"],
  ])("rejects the key %j", (key, message) => {
    const headers: Record<string, string> =
      key === undefined ? {} : { "idempotency-key": key };
    let error: unknown;
    try {
      parseIdempotency(request(headers), options);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "validation_error",
      details: [{ path: "Idempotency-Key", message }],
    });
  });
});

describe("sendMoneyResult", () => {
  const response = () => {
    const sent = {
      status: 0,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
    };
    const res = {
      setHeader(name: string, value: string) {
        sent.headers[name] = value;
      },
      status(code: number) {
        sent.status = code;
        return res;
      },
      json(body: unknown) {
        sent.body = body;
      },
    };
    return { res: res as unknown as NextApiResponse, sent };
  };

  it("keeps the status and marks replays", () => {
    const first = response();
    sendMoneyResult(first.res, 201, { ok: true }, false);
    expect(first.sent).toEqual({
      status: 201,
      body: { ok: true },
      headers: {},
    });

    const replay = response();
    sendMoneyResult(replay.res, 201, { ok: true }, true);
    expect(replay.sent).toEqual({
      status: 201,
      body: { ok: true },
      headers: { "Idempotent-Replayed": "true" },
    });
  });
});
