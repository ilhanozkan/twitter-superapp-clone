import {
  ActivityResponse,
  MoneyResponse,
  PayRequestResponse,
  PaymentRequestResponse,
  PaymentRequestsResponse,
  PlacesResponse,
  TipResponse,
  TransferPageResponse,
  TransferResponse,
  UsersResponse,
  WalletResponse,
} from "../../types/Api";
import { Cents } from "../../types/Money";
import { PaymentRequestStatus } from "../../types/Wallet";
import { request } from "./request";

// The foundation's endpoints (docs/api/wallet.md). Every call that moves
// money takes the Idempotency-Key the caller keeps for that operation
// (useIdempotencyKey), so a retry can never pay twice.

const json = (body: unknown) => JSON.stringify(body);
const id = (value: string) => encodeURIComponent(value);

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(name, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export interface MoneyBody {
  amount: Cents;
  note?: string | null;
}

export const walletApi = {
  getWallet() {
    return request<WalletResponse>("/api/wallet");
  },

  listActivity(page: { limit?: number; cursor?: string | null } = {}) {
    return request<TransferPageResponse>(`/api/wallet/activity${query(page)}`);
  },

  getTransfer(transferId: string) {
    return request<TransferResponse>(`/api/wallet/transfers/${id(transferId)}`);
  },

  send(body: MoneyBody & { to: string }, idempotencyKey: string) {
    return request<MoneyResponse>("/api/wallet/transfers", {
      method: "POST",
      body: json(body),
      idempotencyKey,
    });
  },

  topUp(amount: Cents, idempotencyKey: string) {
    return request<MoneyResponse>("/api/wallet/top-ups", {
      method: "POST",
      body: json({ amount }),
      idempotencyKey,
    });
  },

  listRequests(role: "incoming" | "outgoing", status?: PaymentRequestStatus) {
    return request<PaymentRequestsResponse>(
      `/api/wallet/requests${query({ role, status })}`
    );
  },

  /** Asks `from` to pay the current user. */
  createRequest(body: MoneyBody & { from: string }, idempotencyKey: string) {
    return request<PaymentRequestResponse>("/api/wallet/requests", {
      method: "POST",
      body: json(body),
      idempotencyKey,
    });
  },

  getRequest(requestId: string) {
    return request<PaymentRequestResponse>(
      `/api/wallet/requests/${id(requestId)}`
    );
  },

  payRequest(requestId: string, idempotencyKey: string) {
    return request<PayRequestResponse>(
      `/api/wallet/requests/${id(requestId)}/pay`,
      { method: "POST", idempotencyKey }
    );
  },

  /** The payer says no. Repeating it is harmless. */
  declineRequest(requestId: string) {
    return request<PaymentRequestResponse>(
      `/api/wallet/requests/${id(requestId)}/decline`,
      { method: "POST" }
    );
  },

  /** The requester takes it back. Repeating it is harmless. */
  cancelRequest(requestId: string) {
    return request<PaymentRequestResponse>(
      `/api/wallet/requests/${id(requestId)}/cancel`,
      { method: "POST" }
    );
  },

  tip(tweetId: string, body: MoneyBody, idempotencyKey: string) {
    return request<TipResponse>(`/api/tweets/${id(tweetId)}/tip`, {
      method: "POST",
      body: json(body),
      idempotencyKey,
    });
  },

  searchUsers(q: string, limit?: number) {
    return request<UsersResponse>(`/api/users${query({ q, limit })}`);
  },

  /** Badge counts and live activity; `since` is when Notifications was last opened here. */
  activity(since: string | null) {
    return request<ActivityResponse>(`/api/activity${query({ since })}`);
  },

  places() {
    return request<PlacesResponse>("/api/places");
  },
};
