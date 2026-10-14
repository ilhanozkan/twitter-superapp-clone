import { describe, expect, it } from "vitest";

import {
  announcementText,
  describePayment,
  describeRequest,
  previewText,
} from "./messageText";
import { at, message, paymentRequest, sarah, viewer } from "./testFixtures";

const me = viewer.username;

describe("previewText", () => {
  it("prefixes the viewer's own messages with You", () => {
    expect(
      previewText(message("m1", viewer, at("10:00"), "Anytime 🙌"), me)
    ).toBe("You: Anytime 🙌");
    expect(
      previewText(message("m1", sarah, at("10:00"), "Friday\ncoffee?"), me)
    ).toBe("Friday coffee?");
  });

  it("says what a message without text is", () => {
    const tweet = { id: "t1", author: sarah, text: "Hi" };
    expect(
      previewText(
        message("m1", viewer, at("10:00"), {
          type: "text",
          text: "",
          tweet,
          story: null,
        }),
        me
      )
    ).toBe("You: Shared a Tweet");
    expect(previewText(null, me)).toBe("No messages yet");
  });

  it("states amounts from the viewer's side", () => {
    const payment = message("m1", sarah, at("10:00"), {
      type: "payment",
      transferId: "tx1",
      amount: 1_500,
      note: null,
    });
    expect(previewText(payment, me)).toBe("Sent you 15.00 credits");
    expect(previewText({ ...payment, author: viewer }, me)).toBe(
      "You sent 15.00 credits"
    );

    const request = message("m2", sarah, at("10:00"), {
      type: "request",
      request: paymentRequest(),
    });
    expect(previewText(request, me)).toBe("💸 Requested 4.50 credits");
    expect(previewText({ ...request, author: viewer }, me)).toBe(
      "💸 You requested 4.50 credits"
    );
    expect(
      previewText(
        message("m3", sarah, at("10:00"), { type: "removed", by: "moderator" }),
        me
      )
    ).toBe("Message removed");
  });
});

describe("bubble text", () => {
  it("describes payments and requests for either member", () => {
    expect(describePayment(sarah, 1_500, me)).toBe(
      "Sarah Chen sent you 15.00 credits"
    );
    expect(describePayment(viewer, 200, me)).toBe("You sent 2.00 credits");
    expect(describeRequest(paymentRequest(), me)).toBe(
      "Sarah Chen requested 4.50 credits"
    );
    expect(
      describeRequest(paymentRequest({ requester: viewer, payer: sarah }), me)
    ).toBe("You requested 4.50 credits from Sarah Chen");
  });
});

describe("announcementText", () => {
  it("counts messages and names a single author", () => {
    expect(announcementText(["Sarah Chen"])).toBe(
      "1 new message from Sarah Chen"
    );
    expect(announcementText(["Sarah Chen", "Sarah Chen"])).toBe(
      "2 new messages from Sarah Chen"
    );
    expect(announcementText(["Sarah Chen", "Marco Rossi", "Sarah Chen"])).toBe(
      "3 new messages"
    );
  });
});
