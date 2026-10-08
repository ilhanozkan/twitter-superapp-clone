import { describe, expect, it } from "vitest";

import { envFlag, getCurrentUsername, isReadOnly } from "./auth";
import { ConfigurationError } from "./db/errors";

describe("getCurrentUsername", () => {
  it("defaults to the demo account", () => {
    expect(getCurrentUsername({})).toBe("illlhanozkan");
    expect(getCurrentUsername({ DEMO_USERNAME: "  " })).toBe("illlhanozkan");
  });

  it("can be configured", () => {
    expect(getCurrentUsername({ DEMO_USERNAME: "sarahcodes" })).toBe(
      "sarahcodes"
    );
  });

  it("rejects invalid usernames", () => {
    expect(() => getCurrentUsername({ DEMO_USERNAME: "not valid" })).toThrow(
      ConfigurationError
    );
  });
});

describe("envFlag", () => {
  it("accepts the usual spellings of yes", () => {
    for (const value of ["true", "TRUE", " 1 ", "yes", "On"]) {
      expect(envFlag(value), value).toBe(true);
    }
    for (const value of [undefined, "", "false", "0", "no", "off", "y"]) {
      expect(envFlag(value), String(value)).toBe(false);
    }
  });

  it("drives READ_ONLY", () => {
    expect(isReadOnly({ READ_ONLY: "1" })).toBe(true);
    expect(isReadOnly({ READ_ONLY: "false" })).toBe(false);
    expect(isReadOnly({})).toBe(false);
  });
});
