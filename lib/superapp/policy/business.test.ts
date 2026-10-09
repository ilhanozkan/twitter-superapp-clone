import { describe, expect, it } from "vitest";

import { canManageBusiness } from "./business";

describe("canManageBusiness", () => {
  const business = { username: "SuperApp", managers: ["IlllhanOzkan"] };

  it("allows the business itself and its managers, in any case", () => {
    expect(canManageBusiness("superapp", business)).toBe(true);
    expect(canManageBusiness("illlhanozkan", business)).toBe(true);
  });

  it("refuses everyone else", () => {
    expect(canManageBusiness("sarahcodes", business)).toBe(false);
    expect(
      canManageBusiness("illlhanozkan", {
        username: "kizilaykahve",
        managers: [],
      })
    ).toBe(false);
  });
});
