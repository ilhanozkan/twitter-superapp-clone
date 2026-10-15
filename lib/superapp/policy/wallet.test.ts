import { describe, expect, it } from "vitest";

import {
  canCloseRequest,
  canPayRequest,
  canViewRequest,
  canViewTransfer,
} from "./wallet";

const person = (username: string) => ({
  username,
  fullname: username,
  image: null,
});

describe("wallet policies", () => {
  it("lets only the parties see a transfer, in any case", () => {
    const transfer = { from: person("SarahCodes"), to: person("devmarco") };
    expect(canViewTransfer("sarahcodes", transfer)).toBe(true);
    expect(canViewTransfer("DEVMARCO", transfer)).toBe(true);
    expect(canViewTransfer("lenaframes", transfer)).toBe(false);
  });

  it("lets only the recipient see issued credits", () => {
    const issued = { from: null, to: person("devmarco") };
    expect(canViewTransfer("devmarco", issued)).toBe(true);
    expect(canViewTransfer("superapp", issued)).toBe(false);
  });

  it("lets the payer pay or decline and the requester cancel", () => {
    const request = {
      requester: person("sarahcodes"),
      payer: person("illlhanozkan"),
    };
    expect(canViewRequest("SARAHCODES", request)).toBe(true);
    expect(canViewRequest("illlhanozkan", request)).toBe(true);
    expect(canViewRequest("devmarco", request)).toBe(false);

    expect(canPayRequest("Illlhanozkan", request)).toBe(true);
    expect(canPayRequest("sarahcodes", request)).toBe(false);

    expect(canCloseRequest("illlhanozkan", request, "decline")).toBe(true);
    expect(canCloseRequest("sarahcodes", request, "decline")).toBe(false);
    expect(canCloseRequest("sarahcodes", request, "cancel")).toBe(true);
    expect(canCloseRequest("illlhanozkan", request, "cancel")).toBe(false);
    expect(canCloseRequest("devmarco", request, "cancel")).toBe(false);
  });
});
