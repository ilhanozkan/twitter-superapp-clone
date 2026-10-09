import { vi } from "vitest";

import { LIMITS } from "../../lib/superapp/limits";
import { testViewer } from "../../test/render";
import { IAuthor } from "../../types/User";
import {
  IPaymentRequest,
  ITransfer,
  IWallet,
  IWalletLimits,
} from "../../types/Wallet";

// Fixtures and a fake API for the wallet lane's component tests.

export const sarah: IAuthor = {
  username: "sarahcodes",
  fullname: "Sarah Chen",
  image: null,
};
export const marco: IAuthor = {
  username: "devmarco",
  fullname: "Marco Rossi",
  image: null,
};

export const wallet = (overrides: Partial<IWallet> = {}): IWallet => ({
  username: testViewer.username,
  balance: 30_860,
  pending: 0,
  available: 30_860,
  frozen: false,
  ...overrides,
});

export const limits = (overrides: Partial<IWalletLimits> = {}) => ({
  minPayment: LIMITS.payment.min,
  maxPayment: LIMITS.payment.max,
  minTip: LIMITS.tip.min,
  maxTip: LIMITS.tip.max,
  tipPresets: [...LIMITS.tip.presets],
  topUpAmounts: [...LIMITS.topUp.amounts],
  topUpCap: LIMITS.topUp.cap,
  topUpsPerDay: LIMITS.topUp.perDay,
  topUpsLeftToday: 2,
  pendingRequestsLeft: 9,
  ...overrides,
});

export const transfer = (overrides: Partial<ITransfer> = {}): ITransfer => ({
  id: "tx-1",
  kind: "payment",
  amount: 1_000,
  from: testViewer,
  to: sarah,
  note: null,
  context: null,
  createdAt: "2026-10-09T11:00:00.000Z",
  holdUntil: null,
  reversedBy: null,
  reverses: null,
  ...overrides,
});

export const paymentRequest = (
  overrides: Partial<IPaymentRequest> = {}
): IPaymentRequest => ({
  id: "req-1",
  requester: sarah,
  payer: testViewer,
  amount: 450,
  note: "Coffee ☕",
  status: "pending",
  createdAt: "2026-10-09T07:00:00.000Z",
  expiresAt: "2026-10-16T07:00:00.000Z",
  respondedAt: null,
  transferId: null,
  conversationId: null,
  ...overrides,
});

/** Store state with the wallet loaded (and its limits). */
export const walletState = (
  value: IWallet = wallet(),
  limitsValue: IWalletLimits | null = limits()
) => ({ wallet: value, limits: limitsValue, loaded: true });

export interface ApiCall {
  method: string;
  /** The path with its query, e.g. "/api/users?q=sa&limit=8". */
  url: string;
  body: unknown;
  key: string | null;
}

export type Reply = { status: number; body?: unknown } | "network";

export const ok = (body: unknown, status = 200): Reply => ({ status, body });
export const fail = (status: number, code: string, message: string): Reply => ({
  status,
  body: { error: { code, message, requestId: "test" } },
});

/**
 * Stubs fetch with routes like "POST /api/wallet/transfers" (matched on the
 * path without its query). A list of replies is used in order, the last
 * one repeating. Returns every call, with its body and Idempotency-Key.
 */
export function stubApi(
  routes: Record<string, Reply | Reply[] | ((call: ApiCall) => Reply)>
) {
  const calls: ApiCall[] = [];
  const used = new Map<string, number>();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const headers = new Headers(init.headers);
      const call: ApiCall = {
        method,
        url,
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        key: headers.get("Idempotency-Key"),
      };
      calls.push(call);

      const route = `${method} ${url.split("?")[0]}`;
      const handler = routes[route];
      if (!handler) throw new Error(`No stub for ${route}`);
      let reply: Reply;
      if (typeof handler === "function") reply = handler(call);
      else if (Array.isArray(handler)) {
        const index = used.get(route) ?? 0;
        used.set(route, index + 1);
        reply = handler[Math.min(index, handler.length - 1)];
      } else reply = handler;

      if (reply === "network") throw new TypeError("Failed to fetch");
      return new Response(
        reply.body === undefined ? null : JSON.stringify(reply.body),
        { status: reply.status }
      );
    })
  );

  return {
    calls,
    /** The calls to one route, e.g. "POST /api/wallet/transfers". */
    to: (route: string) =>
      calls.filter(
        (call) => `${call.method} ${call.url.split("?")[0]}` === route
      ),
  };
}
