import { describe, expect, it } from "vitest";

import { getCurrentUsername } from "./auth";
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
