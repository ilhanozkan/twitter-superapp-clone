import { describe, expect, it } from "vitest";

import { priceOrder } from "../../lib/superapp/orders";
import { business, status } from "../shop/testing";
import { orderBlocker } from "./blockers";
import {
  clockText,
  itemsText,
  orderPath,
  statusText,
  tweetAboutIt,
} from "./format";
import { orderNotificationRenderers } from "./notificationRenderers";
import { orderAgainChoices } from "./OrderAgainRow";
import { at, marco, order } from "./testing";

// The orders feature's wording and the pure decisions its UI makes.

const kahve = business();
const latte = (quantity: number, unitPrice = 500) =>
  priceOrder(
    [
      {
        productId: "seed-p-kk-latte",
        name: "Pistachio latte",
        unitPrice,
        quantity,
      },
    ],
    kahve
  );

describe("order wording", () => {
  it("lists items and links to the tracker", () => {
    expect(
      itemsText([
        { name: "Pistachio latte", quantity: 1 },
        { name: "Simit", quantity: 2 },
      ])
    ).toBe("Pistachio latte ×1, Simit ×2");
    expect(orderPath("seed-o01")).toBe("/orders/seed-o01");
  });

  it("says where an order stands, from either side", () => {
    const placed = order();
    expect(statusText(placed, "buyer")).toBe(
      `Placed · Arrives around ${clockText(placed.deliverAt)}`
    );
    const onTheWay = order({}, { now: at(20) });
    expect(statusText(onTheWay, "buyer")).toBe(
      `On the way · Arrives around ${clockText(onTheWay.deliverAt)}`
    );
    const delivered = order({}, { now: at(30) });
    expect(statusText(delivered, "buyer")).toBe(
      `Delivered at ${clockText(delivered.deliverAt)}`
    );

    const cancelled = order(
      { cancelledAt: at(5).toISOString(), cancelledBy: "business" },
      { now: at(6) }
    );
    expect(statusText(cancelled, "buyer")).toBe(
      "Cancelled by Kızılay Kahve · 6.50 credits refunded"
    );
    expect(statusText(cancelled, "business")).toBe(
      "You cancelled · 6.50 credits refunded"
    );
  });

  it("prefills Tweet about it with the product and how it was ordered", () => {
    expect(tweetAboutIt(order({}, { now: at(30) }))).toEqual({
      text: "Just had the Pistachio latte from @kizilaykahve, ordered right from a Tweet ☕ #SuperApp",
      attachment: { type: "product", productId: "seed-p-kk-latte" },
    });
    const stickers = order({
      sourceTweetId: null,
      business: {
        username: "superapp",
        fullname: "Twitter SuperApp",
        image: null,
        category: "shop",
      },
      lines: [
        {
          productId: "seed-p-sa-stickers",
          name: "Sticker pack",
          unitPrice: 300,
          quantity: 1,
          total: 300,
        },
      ],
    });
    expect(tweetAboutIt(stickers).text).toBe(
      "Just got the Sticker pack from @superapp, ordered on Twitter SuperApp 🛍️ #SuperApp"
    );
  });
});

describe("orderBlocker", () => {
  const blocker = (
    overrides: Partial<Parameters<typeof orderBlocker>[0]> = {}
  ) =>
    orderBlocker({
      readOnly: false,
      business: kahve,
      unavailable: [],
      price: latte(1),
      available: 10_000,
      ...overrides,
    });

  it("lets an order through when nothing stands in its way", () => {
    expect(blocker()).toBeNull();
  });

  it("says why, in the order the server checks", () => {
    expect(blocker({ readOnly: true })?.message).toBe(
      "Ordering is turned off on this read-only demo."
    );
    expect(
      blocker({ business: business({ status: status.closed }) })?.message
    ).toBe("Kızılay Kahve: Closed · Opens 18:00");
    expect(
      blocker({ unavailable: [{ name: "Simit", gone: false }] })?.message
    ).toBe("Simit is sold out.");
    expect(
      blocker({
        unavailable: [{ name: "Simit", gone: true }],
        removable: true,
      })?.message
    ).toBe("Simit is no longer available. Remove it to order.");
    expect(
      blocker({
        unavailable: [
          { name: "Simit", gone: false },
          { name: "Cold brew", gone: true },
        ],
        removable: true,
      })?.message
    ).toBe(
      "Some items are sold out or no longer available. Remove them to order."
    );
    expect(blocker({ price: latte(1, 200) })?.message).toBe(
      "The minimum order at Kızılay Kahve is 3.00 credits. Add 1.00 credits more."
    );
    expect(blocker({ price: latte(20, 1_000) })?.message).toBe(
      "An order can be up to 200.00 credits."
    );
    expect(blocker({ available: 600 })).toEqual({
      message: "You have 6.00 credits available.",
      funds: true,
    });
  });
});

describe("orderNotificationRenderers", () => {
  const base = {
    id: "n",
    createdAt: "2026-10-14T09:00:00.000Z",
    type: "order" as const,
    orderId: "seed-o03",
    code: "M2X9",
  };
  const render = (
    notification: Parameters<
      NonNullable<typeof orderNotificationRenderers.order>
    >[0]
  ) =>
    orderNotificationRenderers.order!(notification, {
      viewer: "illlhanozkan",
      features: {
        wallet: true,
        messages: false,
        channels: false,
        shop: true,
        orders: true,
        rides: false,
        stories: false,
      },
    });
  const kahveAuthor = {
    username: "kizilaykahve",
    fullname: "Kızılay Kahve",
    image: null,
  };

  it("tells the business about a new order and leads to its board", () => {
    const view = render({
      ...base,
      event: "received",
      actor: marco,
      business: "Twitter SuperApp",
    });
    expect(view.text).toBe(
      "New order #M2X9 from Marco Rossi at Twitter SuperApp"
    );
    expect(view.href).toBe("/business");
  });

  it("tells the buyer about a delivery or a cancel, leading to the order", () => {
    const delivered = render({
      ...base,
      code: "K7Q2",
      orderId: "seed-o01",
      event: "delivered",
      actor: kahveAuthor,
      business: "Kızılay Kahve",
    });
    expect(delivered.text).toBe(
      "Your order #K7Q2 from Kızılay Kahve was delivered"
    );
    expect(delivered.href).toBe("/orders/seed-o01");

    const cancelled = render({
      ...base,
      event: "cancelled",
      actor: kahveAuthor,
      business: "Kızılay Kahve",
    });
    // Starts with the actor's name, which the card shows in bold.
    expect(cancelled.text).toBe(
      "Kızılay Kahve cancelled your order #M2X9. You got a full refund."
    );
    expect(cancelled.href).toBe("/orders/seed-o03");
  });
});

describe("orderAgainChoices", () => {
  it("offers the latest delivery from each place, three at most", () => {
    const delivered = (id: string, username: string) =>
      order(
        {
          id,
          business: { ...order().business, username, fullname: username },
        },
        { now: at(60) }
      );
    const cancelled = order(
      { id: "c", cancelledAt: at(2).toISOString(), cancelledBy: "buyer" },
      { now: at(60) }
    );
    expect(
      orderAgainChoices([
        cancelled,
        delivered("a", "kizilaykahve"),
        delivered("b", "KizilayKahve"),
        delivered("d", "lahmacunlab"),
        delivered("e", "bowlandco"),
        delivered("f", "superapp"),
      ]).map((item) => item.id)
    ).toEqual(["a", "d", "e"]);
  });
});
