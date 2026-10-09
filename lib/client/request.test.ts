import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, request } from "./request";

const ok = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), { status, headers });

const failure = (status: number, code: string) =>
  ok({ error: { code, message: `${code} happened`, requestId: "r1" } }, status);

/** fetch answering each call with the next response (or throwing it). */
function fetchSequence(...answers: (Response | Error)[]) {
  const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
    async () => {
      const next = answers.shift();
      if (!next) throw new Error("unexpected extra request");
      if (next instanceof Error) throw next;
      return next;
    }
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const keyOf = (init?: RequestInit) =>
  (init?.headers as Record<string, string>)["Idempotency-Key"];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends JSON and resolves with the body", async () => {
    const fetch = fetchSequence(ok({ hello: "world" }));
    await expect(
      request("/api/x", { method: "POST", body: "{}" })
    ).resolves.toEqual({ hello: "world" });
    expect(fetch.mock.calls[0][1]?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  });

  it("throws the server's error code and message", async () => {
    fetchSequence(failure(402, "insufficient_funds"));
    const error = await request("/api/x").catch((reason) => reason);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 402,
      code: "insufficient_funds",
      message: "insufficient_funds happened",
      requestId: "r1",
    });
  });

  it("returns the response headers with withHeaders", async () => {
    fetchSequence(ok({ a: 1 }, 201, { "Idempotent-Replayed": "true" }));
    const { body, headers } = await request<{ a: number }>("/api/x", {
      withHeaders: true,
    });
    expect(body).toEqual({ a: 1 });
    expect(headers.get("Idempotent-Replayed")).toBe("true");
  });

  it("sets the Idempotency-Key header", async () => {
    const fetch = fetchSequence(ok({}));
    await request("/api/x", { method: "POST", idempotencyKey: "key-12345" });
    expect(keyOf(fetch.mock.calls[0][1])).toBe("key-12345");
  });

  it("retries a keyed request once, with the same key, after a network error", async () => {
    const fetch = fetchSequence(new TypeError("Failed to fetch"), ok({ n: 2 }));
    await expect(
      request("/api/x", { method: "POST", idempotencyKey: "key-12345" })
    ).resolves.toEqual({ n: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([, init]) => keyOf(init))).toEqual([
      "key-12345",
      "key-12345",
    ]);
  });

  it("retries a keyed request once after a 409 conflict", async () => {
    const fetch = fetchSequence(failure(409, "conflict"), ok({ n: 2 }));
    await expect(
      request("/api/x", { method: "POST", idempotencyKey: "key-12345" })
    ).resolves.toEqual({ n: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries only once", async () => {
    const fetch = fetchSequence(
      failure(409, "conflict"),
      failure(409, "conflict")
    );
    await expect(
      request("/api/x", { method: "POST", idempotencyKey: "key-12345" })
    ).rejects.toMatchObject({ code: "conflict" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [402, "insufficient_funds"],
    [409, "invalid_state"],
    [422, "idempotency_key_reused"],
    [429, "rate_limited"],
    [500, "internal_error"],
  ])("never retries a %i %s", async (status, code) => {
    const fetch = fetchSequence(failure(status, code));
    await expect(
      request("/api/x", { method: "POST", idempotencyKey: "key-12345" })
    ).rejects.toMatchObject({ status, code });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never retries a request without a key", async () => {
    const fetch = fetchSequence(new TypeError("Failed to fetch"));
    await expect(request("/api/x", { method: "POST" })).rejects.toMatchObject({
      code: "network_error",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
