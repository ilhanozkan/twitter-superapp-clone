import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { call } from "../../test/api";

let createHandler: typeof import("./handler").createHandler;
// Imported after resetModules so `instanceof` checks see the same classes as the handler.
let errors: typeof import("./errors");
let dbErrors: typeof import("../db/errors");

beforeEach(async () => {
  vi.resetModules();
  ({ createHandler } = await import("./handler"));
  errors = await import("./errors");
  dbErrors = await import("../db/errors");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createHandler", () => {
  it("routes by method and answers HEAD with the GET handler", async () => {
    const handler = createHandler({
      GET: (req, res) => res.status(200).json({ ok: true }),
    });

    expect((await call(handler)).body).toEqual({ ok: true });
    expect((await call(handler, { method: "HEAD" })).statusCode).toBe(200);
  });

  it("answers unknown methods with 405 and an Allow header", async () => {
    const handler = createHandler({
      GET: (req, res) => res.status(200).json({}),
    });
    const res = await call(handler, { method: "PATCH" });

    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET, HEAD, OPTIONS");
    expect(res.body.error).toMatchObject({ code: "method_not_allowed" });
  });

  it("answers OPTIONS with 204", async () => {
    const res = await call(createHandler({ POST: () => undefined }), {
      method: "OPTIONS",
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers.allow).toBe("POST, OPTIONS");
  });

  it("maps errors to statuses without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwing = (error: unknown) =>
      createHandler({
        GET: () => {
          throw error;
        },
      });

    const cases: [unknown, number, string][] = [
      [new errors.ApiError(418, "bad_request", "teapot"), 418, "bad_request"],
      [
        z.object({ a: z.string() }).safeParse({}).error,
        400,
        "validation_error",
      ],
      [new dbErrors.NotFoundError("Tweet not found"), 404, "not_found"],
      [
        new dbErrors.ConfigurationError("read-only"),
        503,
        "service_unavailable",
      ],
      [new Error("database password is hunter2"), 500, "internal_error"],
    ];

    for (const [error, status, code] of cases) {
      const res = await call(throwing(error));
      expect(res.statusCode).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(JSON.stringify(res.body)).not.toContain("hunter2");
      expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    }
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("keeps a well-formed incoming request id and replaces others", async () => {
    const handler = createHandler({
      GET: (req, res) => res.status(200).json({}),
    });

    expect(
      (await call(handler, { headers: { "x-request-id": "abc-123" } })).headers[
        "x-request-id"
      ]
    ).toBe("abc-123");
    expect(
      (await call(handler, { headers: { "x-request-id": "<script>" } }))
        .headers["x-request-id"]
    ).not.toBe("<script>");
  });

  it("checks the origin of writes only", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const handler = createHandler({
      GET: (req, res) => res.status(200).json({}),
      DELETE: (req, res) => res.status(204).end(),
    });
    const evil = { origin: "https://evil.example" };

    expect((await call(handler, { headers: evil })).statusCode).toBe(200);
    expect(
      (await call(handler, { method: "DELETE", headers: evil })).statusCode
    ).toBe(403);
    expect(
      (await call(handler, { method: "DELETE", headers: { origin: "null" } }))
        .statusCode
    ).toBe(403);
    expect(
      (
        await call(handler, {
          method: "DELETE",
          headers: { origin: "http://localhost:3000" },
        })
      ).statusCode
    ).toBe(204);
    expect(
      (
        await call(handler, {
          method: "DELETE",
          headers: {
            origin: "https://app.example",
            "x-forwarded-host": "app.example",
          },
        })
      ).statusCode
    ).toBe(204);
  });

  it("only believes X-Forwarded-Host behind a trusted proxy", async () => {
    const handler = createHandler({
      DELETE: (req, res) => res.status(204).end(),
    });
    const forwarded = {
      method: "DELETE",
      headers: {
        origin: "https://app.example",
        "x-forwarded-host": "app.example",
      },
    };

    expect((await call(handler, forwarded)).statusCode).toBe(403);
    vi.stubEnv("TRUST_PROXY", "true");
    expect((await call(handler, forwarded)).statusCode).toBe(204);
  });

  it("rate-limits writes per client", async () => {
    vi.resetModules();
    vi.stubEnv("WRITE_RATE_LIMIT", "2");
    vi.stubEnv("TRUST_PROXY", "true");
    ({ createHandler } = await import("./handler"));

    const handler = createHandler({
      POST: (req, res) => res.status(201).json({}),
    });
    const from = (ip: string) => ({
      method: "POST",
      // The trusted proxy appends the address it saw: the right-most entry.
      headers: { "x-forwarded-for": `10.0.0.1, ${ip}` },
    });

    expect((await call(handler, from("1.1.1.1"))).statusCode).toBe(201);
    expect((await call(handler, from("1.1.1.1"))).statusCode).toBe(201);

    const limited = await call(handler, from("1.1.1.1"));
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);

    expect((await call(handler, from("2.2.2.2"))).statusCode).toBe(201);
  });

  it("ignores forwarding headers unless a proxy is trusted", async () => {
    const { clientAddress } = await import("./handler");
    const req = (headers: Record<string, string>) =>
      ({ headers, socket: { remoteAddress: "10.0.0.2" } } as never);
    // The client controls everything left of the hop its proxy appended.
    const spoofed = req({
      "x-forwarded-for": "1.2.3.4, 6.6.6.6",
      "x-real-ip": "7.7.7.7",
    });

    expect(clientAddress(spoofed, {})).toBe("10.0.0.2");
    expect(clientAddress(spoofed, { TRUST_PROXY: "true" })).toBe("6.6.6.6");
    expect(clientAddress(spoofed, { TRUST_PROXY: "1" })).toBe("6.6.6.6");
    expect(clientAddress(spoofed, { TRUST_PROXY: "false" })).toBe("10.0.0.2");
    // On Vercel the platform sets X-Real-IP and clients cannot override it.
    expect(clientAddress(spoofed, { VERCEL: "1" })).toBe("7.7.7.7");
    expect(
      clientAddress(req({ "x-forwarded-for": "1.2.3.4, 6.6.6.6" }), {
        VERCEL: "1",
      })
    ).toBe("6.6.6.6");
    expect(clientAddress(req({}), { TRUST_PROXY: "true" })).toBe("10.0.0.2");
  });

  it("reads WRITE_RATE_LIMIT, falling back to the default when invalid", async () => {
    const { writesPerMinute } = await import("./handler");

    expect(writesPerMinute(undefined)).toBe(30);
    expect(writesPerMinute("")).toBe(30);
    expect(writesPerMinute(" 5 ")).toBe(5);
    expect(writesPerMinute("0")).toBe(0);
    for (const invalid of ["-1", "1.5", "ten", "Infinity"]) {
      expect(writesPerMinute(invalid), invalid).toBe(30);
    }
  });

  it("never lets an error response be cached", async () => {
    const handler = createHandler({
      GET: (req, res) => {
        res.setHeader("Cache-Control", "public, s-maxage=60");
        throw new errors.ApiError(404, "not_found", "gone");
      },
    });
    const res = await call(handler);

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it.each(["true", "1", "YES", "on"])(
    "rejects every write when READ_ONLY=%s",
    async (value) => {
      vi.stubEnv("READ_ONLY", value);
      const handler = createHandler({
        GET: (req, res) => res.status(200).json({}),
        POST: (req, res) => res.status(201).json({}),
      });

      expect((await call(handler)).statusCode).toBe(200);
      const res = await call(handler, { method: "POST" });
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe("read_only");
    }
  );

  it("can disable rate limiting", async () => {
    vi.resetModules();
    vi.stubEnv("WRITE_RATE_LIMIT", "0");
    ({ createHandler } = await import("./handler"));

    const handler = createHandler({
      POST: (req, res) => res.status(201).json({}),
    });
    for (let i = 0; i < 50; i++) {
      expect((await call(handler, { method: "POST" })).statusCode).toBe(201);
    }
  });
});
