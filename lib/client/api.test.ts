import { describe, expect, it } from "vitest";

import { ApiRequestError, errorMessage } from "./api";

describe("errorMessage", () => {
  it("reads thrown and serialized errors", () => {
    expect(
      errorMessage(new ApiRequestError(429, "rate_limited", "Slow down"))
    ).toBe("Slow down");
    expect(errorMessage({ name: "Error", message: "Serialized" })).toBe(
      "Serialized"
    );
    expect(errorMessage({ message: "" })).toBe(
      "Something went wrong. Try again."
    );
    expect(errorMessage("nope")).toBe("Something went wrong. Try again.");
  });
});
