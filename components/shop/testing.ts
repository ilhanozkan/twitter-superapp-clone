import { businessStatus, etaMinutes } from "../../lib/superapp/business";
import { IBusiness, IBusinessStatus } from "../../types/Business";
import { IProduct, IProductCard } from "../../types/Shop";
import { ITweet } from "../../types/Tweet";

// Fixtures for the shop's component tests (not used by the app).

const ISTANBUL = "Europe/Istanbul";
/** 12:00 in Istanbul. */
export const NOON = new Date("2026-10-09T09:00:00.000Z");

export const status = {
  open24: businessStatus(
    { opens: "00:00", closes: "00:00", timeZone: ISTANBUL },
    true,
    false,
    NOON
  ),
  closed: businessStatus(
    { opens: "18:00", closes: "02:00", timeZone: ISTANBUL },
    true,
    false,
    NOON
  ),
  paused: businessStatus(
    { opens: "00:00", closes: "00:00", timeZone: ISTANBUL },
    false,
    false,
    NOON
  ),
} satisfies Record<string, IBusinessStatus>;

export function business(overrides: Partial<IBusiness> = {}): IBusiness {
  return {
    username: "kizilaykahve",
    fullname: "Kızılay Kahve",
    image: null,
    banner: null,
    category: "cafe",
    description: "Turkish coffee and simit.",
    placeId: "kizilay",
    address: "Kızılay Square, Çankaya, Ankara",
    hours: { opens: "00:00", closes: "00:00", timeZone: ISTANBUL },
    acceptingOrders: true,
    prepMinutes: 3,
    deliveryMinutes: 6,
    deliveryFee: 150,
    minimumOrder: 300,
    greeting: null,
    managers: [],
    status: status.open24,
    etaMinutes: etaMinutes(3, 6),
    ...overrides,
  };
}

export function product(overrides: Partial<IProduct> = {}): IProduct {
  return {
    id: "seed-p-kk-latte",
    business: "kizilaykahve",
    section: "Coffee",
    name: "Pistachio latte",
    description: "Espresso, steamed milk and Antep pistachio cream.",
    price: 500,
    image: "/media/menu/pistachio-latte.svg",
    imageAlt: "A tall glass of pistachio latte",
    available: true,
    position: 2,
    ...overrides,
  };
}

export function card(
  overrides: Partial<Omit<IProductCard, "business">> = {},
  businessOverrides: Partial<IProductCard["business"]> = {}
): IProductCard {
  return {
    id: "seed-p-kk-latte",
    name: "Pistachio latte",
    price: 500,
    image: "/media/menu/pistachio-latte.svg",
    imageAlt: "A tall glass of pistachio latte",
    available: true,
    ...overrides,
    business: {
      username: "kizilaykahve",
      fullname: "Kızılay Kahve",
      image: null,
      status: status.open24,
      etaMinutes: [9, 12],
      ...businessOverrides,
    },
  };
}

export function tweet(attachment: ITweet["attachment"]): ITweet {
  return {
    id: "seed-t22",
    text: "New on the menu: pistachio latte ☕",
    image: null,
    createdAt: "2026-10-09T08:10:00.000Z",
    author: {
      username: "kizilaykahve",
      fullname: "Kızılay Kahve",
      image: null,
    },
    stats: { replies: 1, retweets: 0, likes: 3, tips: 0 },
    viewer: {
      liked: false,
      retweeted: false,
      bookmarked: false,
      tipped: false,
    },
    attachment,
  };
}

/** A fetch stub answering JSON by path, recording each call. */
export function stubFetch(
  routes: Record<string, (init?: RequestInit) => [number, unknown]>
) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const fetch = async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const route = routes[path.split("?")[0]];
    const [status, body] = route
      ? route(init)
      : [404, { error: { code: "not_found", message: "Not found" } }];
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}
