import { orderAt, orderSchedule, priceOrder } from "../../lib/superapp/orders";
import { getPlace } from "../../lib/superapp/places";
import { IOrder } from "../../types/Order";
import { IWallet } from "../../types/Wallet";

// Fixtures for the orders feature's component tests (not used by the app).

export const T0 = new Date("2026-10-14T09:00:00.000Z");
export const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
export const iso = (seconds: number) => at(seconds).toISOString();

export const marco = {
  username: "devmarco",
  fullname: "Marco Rossi",
  image: null,
};

/**
 * An order from Kızılay Kahve (3 min prep, 6 min delivery) placed at
 * T0 + `placedAfter` seconds on the e2e scale (60): accepted 15 s later,
 * on its way 3 s after that, delivered 6 s after that. Derived at `now`.
 */
export function order(
  overrides: Partial<IOrder> = {},
  {
    now = at(1),
    placedAfter = 0,
    timeScale = 60,
  }: { now?: Date; placedAfter?: number; timeScale?: number } = {}
): IOrder {
  const price = priceOrder(
    [
      {
        productId: "seed-p-kk-latte",
        name: "Pistachio latte",
        unitPrice: 500,
        quantity: 1,
      },
    ],
    { deliveryFee: 150, minimumOrder: 300 }
  );
  const base: IOrder = {
    id: "order-abc",
    code: "K7Q2",
    buyer: {
      username: "illlhanozkan",
      fullname: "Ilhan Ozkan",
      image: null,
    },
    placedBy: "buyer",
    business: {
      username: "kizilaykahve",
      fullname: "Kızılay Kahve",
      image: null,
      category: "cafe",
    },
    lines: price.lines,
    subtotal: price.subtotal,
    deliveryFee: price.deliveryFee,
    total: price.total,
    deliveryPlace: getPlace("tunali"),
    note: null,
    sourceTweetId: "seed-t22",
    ...orderSchedule(
      at(placedAfter),
      { prepMinutes: 3, deliveryMinutes: 6 },
      timeScale
    ),
    cancelledAt: null,
    cancelledBy: null,
    paymentTransferId: "order-abc-1",
    refundTransferId: null,
    status: "placed",
    stages: [],
    eta: null,
    nextChangeAt: null,
    canCancel: { buyer: false, business: false },
    ...overrides,
  };
  return orderAt(base, now);
}

export function wallet(available: number, username = "illlhanozkan"): IWallet {
  return {
    username,
    balance: available,
    pending: 0,
    available,
    frozen: false,
  };
}
