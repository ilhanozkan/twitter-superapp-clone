import { describe, expect, it } from "vitest";

import { getDataSource, getSanityConfig, SANITY_API_VERSION } from "./config";
import { ConfigurationError } from "./db/errors";

describe("getDataSource", () => {
  it("falls back to the in-memory demo store when nothing is configured", () => {
    expect(getDataSource({})).toBe("memory");
  });

  it("uses Sanity once a project id is configured (new or legacy name)", () => {
    expect(getDataSource({ SANITY_PROJECT_ID: "abc123" })).toBe("sanity");
    expect(getDataSource({ NEXT_PUBLIC_SANITY_PROJECT_ID: "abc123" })).toBe(
      "sanity"
    );
  });

  it("lets DATA_SOURCE override the detection", () => {
    expect(
      getDataSource({ DATA_SOURCE: "memory", SANITY_PROJECT_ID: "abc123" })
    ).toBe("memory");
    expect(getDataSource({ DATA_SOURCE: " Sanity " })).toBe("sanity");
  });

  it("rejects unknown data sources", () => {
    expect(() => getDataSource({ DATA_SOURCE: "postgres" })).toThrow(
      /Invalid DATA_SOURCE/
    );
    // A ConfigurationError, so the API answers 503 instead of 500.
    expect(() => getDataSource({ DATA_SOURCE: "postgres" })).toThrow(
      ConfigurationError
    );
  });
});

describe("getSanityConfig", () => {
  it("reads the project, dataset and token", () => {
    expect(
      getSanityConfig({
        SANITY_PROJECT_ID: "abc123",
        SANITY_DATASET: "staging",
        SANITY_API_TOKEN: "secret",
      })
    ).toEqual({
      projectId: "abc123",
      dataset: "staging",
      apiVersion: SANITY_API_VERSION,
      token: "secret",
    });
  });

  it("defaults the dataset and supports the legacy NEXT_PUBLIC_ names", () => {
    expect(
      getSanityConfig({ NEXT_PUBLIC_SANITY_PROJECT_ID: "abc123" })
    ).toMatchObject({
      projectId: "abc123",
      dataset: "production",
      token: undefined,
    });
  });

  it("explains what is missing", () => {
    expect(() => getSanityConfig({ DATA_SOURCE: "sanity" })).toThrow(
      /SANITY_PROJECT_ID is not set/
    );
  });
});
