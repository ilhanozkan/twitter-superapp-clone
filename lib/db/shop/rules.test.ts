import { describe, expect, it } from "vitest";

import { businessStatus, toBusiness } from "../../superapp/business";
import {
  BUSINESS_CATEGORIES,
  catalogEntries,
  compareProducts,
  entriesFor,
  isComplete,
  managedProducts,
  menuOrder,
  toBusinessSummary,
  toMenu,
  toProductCard,
} from "../../superapp/shop";
import { IBusiness } from "../../../types/Business";
import { IProduct } from "../../../types/Shop";
import { BusinessProfile } from "../business/types";

// The shop's pure rules (lib/superapp/shop.ts), which both stores call.

const NOON_UTC = new Date("2026-10-08T12:00:00.000Z"); // 15:00 in Istanbul
const NIGHT_UTC = new Date("2026-10-09T02:00:00.000Z"); // 05:00 in Istanbul

const profile = (
  username: string,
  fields: Partial<BusinessProfile> = {}
): BusinessProfile => ({
  username,
  banner: null,
  category: "restaurant",
  description: null,
  placeId: "ulus",
  address: "Ulus, Ankara",
  hours: { opens: "11:00", closes: "04:00", timeZone: "Europe/Istanbul" },
  acceptingOrders: true,
  prepMinutes: 6,
  deliveryMinutes: 8,
  deliveryFee: 200,
  minimumOrder: 500,
  greeting: null,
  managers: [],
  ...fields,
});

const business = (
  username: string,
  fields: Partial<BusinessProfile> = {},
  { now = NOON_UTC, frozen = false } = {}
): IBusiness =>
  toBusiness(
    profile(username, fields),
    { username, fullname: username.toUpperCase(), image: null },
    frozen,
    now
  );

const item = (
  id: string,
  section: string,
  position: number,
  fields: Partial<IProduct> = {}
): IProduct => ({
  id,
  business: "lab",
  section,
  name: `Product ${id}`,
  description: null,
  price: 400,
  image: null,
  imageAlt: null,
  available: true,
  position,
  ...fields,
});

const ids = (products: IProduct[]) => products.map((product) => product.id);

describe("menu order", () => {
  it("sorts by position, then by id in code-point order", () => {
    const products = [
      item("b", "Mains", 2),
      item("a", "Mains", 2),
      item("Z", "Mains", 2),
      item("c", "Mains", 1),
    ];
    expect(ids([...products].sort(compareProducts))).toEqual([
      "c",
      "Z",
      "a",
      "b",
    ]);
  });

  it("orders sections by their first product and products within them", () => {
    const menu = toMenu([
      item("soup", "Soups", 3),
      item("kebab", "Mains", 2),
      item("ayran", "Drinks", 9),
      item("lahmacun", "Mains", 1),
      item("pide", "Mains", 7),
    ]);

    expect(menu.map(({ title, products }) => [title, ids(products)])).toEqual([
      ["Mains", ["lahmacun", "kebab", "pide"]],
      ["Soups", ["soup"]],
      ["Drinks", ["ayran"]],
    ]);
    // Top to bottom, a later product of an earlier section comes first.
    expect(
      ids(
        menuOrder([
          item("soup", "Soups", 3),
          item("lahmacun", "Mains", 1),
          item("pide", "Mains", 7),
        ])
      )
    ).toEqual(["lahmacun", "pide", "soup"]);
    expect(toMenu([])).toEqual([]);
  });
});

describe("catalog", () => {
  it("only shows complete products", () => {
    expect(isComplete(item("a", "Mains", 0))).toBe(true);
    expect(isComplete(item("a", "Mains", 0, { price: 10 }))).toBe(true);
    expect(isComplete(item("a", "Mains", 0, { price: 20_000 }))).toBe(true);
    for (const fields of [
      { name: " " },
      { section: "" },
      { price: 9 },
      { price: 20_001 },
      { price: 4.5 },
      { price: Number.NaN },
      { position: Number.NaN },
    ]) {
      expect(
        isComplete(item("a", "Mains", 0, fields)),
        JSON.stringify(fields)
      ).toBe(false);
    }
  });

  it("keeps products of businesses, named by the business's own username", () => {
    const lab = business("lab");
    const entries = catalogEntries(
      [
        item("a", "Mains", 1, { business: "LAB" }),
        item("b", "Mains", 2, { business: "someone" }),
        item("c", "Mains", 3, { name: "" }),
      ],
      [lab]
    );
    expect(entries).toEqual([
      { product: item("a", "Mains", 1, { business: "lab" }), business: lab },
    ]);
  });

  it("finds entries in the order asked, each once", () => {
    const entries = catalogEntries(
      [item("a", "Mains", 1), item("b", "Mains", 2)],
      [business("lab")]
    );
    expect(
      entriesFor(["b", "x", "a", "b"], entries).map((e) => e.product.id)
    ).toEqual(["b", "a"]);
  });

  it("builds a card from the product and the business as it is now", () => {
    const [entry] = catalogEntries(
      [item("a", "Mains", 1, { image: "/a.svg", imageAlt: "A" })],
      [business("lab", {}, { now: NIGHT_UTC })]
    );
    expect(toProductCard(entry)).toEqual({
      id: "a",
      name: "Product a",
      price: 400,
      image: "/a.svg",
      imageAlt: "A",
      available: true,
      business: {
        username: "lab",
        fullname: "LAB",
        image: null,
        status: expect.objectContaining({
          open: false,
          label: "Closed · Opens 11:00",
        }),
        etaMinutes: [14, 17],
      },
    });
  });
});

describe("business summaries", () => {
  it("carry the status businessStatus derives at that time", () => {
    for (const [now, frozen, acceptingOrders] of [
      [NOON_UTC, false, true],
      [NIGHT_UTC, false, true],
      [NOON_UTC, true, true],
      [NOON_UTC, false, false],
    ] as const) {
      const lab = business("lab", { acceptingOrders }, { now, frozen });
      expect(toBusinessSummary(lab, []).status).toEqual(
        businessStatus(lab.hours, acceptingOrders, frozen, now)
      );
    }
  });

  it("highlight the first three available products, top to bottom", () => {
    const summary = toBusinessSummary(business("lab", { banner: "/b.svg" }), [
      item("ayran", "Drinks", 1),
      item("kebab", "Mains", 0, { available: false }),
      item("lahmacun", "Mains", 2),
      item("pide", "Mains", 5),
      item("soup", "Soups", 3),
    ]);
    expect(summary).toEqual({
      username: "lab",
      fullname: "LAB",
      image: null,
      banner: "/b.svg",
      category: "restaurant",
      placeId: "ulus",
      deliveryFee: 200,
      status: expect.objectContaining({ open: true }),
      etaMinutes: [14, 17],
      highlights: ["Product lahmacun", "Product pide", "Product ayran"],
    });
    expect(toBusinessSummary(business("lab"), []).highlights).toEqual([]);
  });
});

describe("attachable products", () => {
  it("are the available products of the businesses a user runs, their own first", () => {
    const businesses = [
      business("cafe", { managers: ["Ayse"] }),
      business("ayse"),
      business("other"),
    ];
    const entries = catalogEntries(
      [
        item("c2", "Coffee", 2, { business: "cafe" }),
        item("c1", "Coffee", 1, { business: "cafe" }),
        item("a1", "Merch", 1, { business: "ayse" }),
        item("a2", "Merch", 2, { business: "ayse", available: false }),
        item("o1", "Food", 1, { business: "other" }),
      ],
      businesses
    );

    expect(ids(managedProducts("AYSE", businesses, entries))).toEqual([
      "a1",
      "c1",
      "c2",
    ]);
    expect(managedProducts("nobody", businesses, entries)).toEqual([]);
  });
});

it("lists every business category", () => {
  expect(BUSINESS_CATEGORIES).toEqual([
    "cafe",
    "restaurant",
    "healthy",
    "shop",
  ]);
});
