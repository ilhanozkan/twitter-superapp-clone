import { Cents } from "./Money";
import { IAuthor } from "./User";

export type TransferKind =
  | "issue"
  | "payment"
  | "tip"
  | "request"
  | "order"
  | "order_refund"
  | "ride"
  | "ride_refund";

export type TransferContext =
  | { type: "tweet"; id: string }
  | { type: "conversation"; id: string }
  | { type: "request"; id: string }
  | { type: "order"; id: string; code: string }
  | { type: "ride"; id: string; code: string };

export interface ITransfer {
  id: string;
  kind: TransferKind;
  /** > 0 */
  amount: Cents;
  /** null: demo credits issued by SuperApp. */
  from: IAuthor | null;
  to: IAuthor;
  note: string | null;
  context: TransferContext | null;
  createdAt: string;
  /** The credit is pending for `to` (not spendable) until then; it can only be refunded before it. */
  holdUntil: string | null;
  /** On a held credit that was refunded: the refund transfer's id. */
  reversedBy: string | null;
  /** On a refund: the transfer it reverses. */
  reverses: string | null;
}

export interface IWallet {
  username: string;
  /** Everything in the wallet. */
  balance: Cents;
  /** Unreversed held credits with holdUntil > now. */
  pending: Cents;
  /** balance - pending: what can be spent. */
  available: Cents;
  frozen: boolean;
}

export interface IWalletLimits {
  minPayment: Cents;
  maxPayment: Cents;
  minTip: Cents;
  maxTip: Cents;
  tipPresets: Cents[];
  topUpAmounts: Cents[];
  topUpCap: Cents;
  topUpsPerDay: number;
  topUpsLeftToday: number;
  pendingRequestsLeft: number;
}

export type PaymentRequestStatus =
  "pending" | "paid" | "declined" | "cancelled" | "expired";

export interface IPaymentRequest {
  id: string;
  /** Gets paid. */
  requester: IAuthor;
  /** Is asked to pay. */
  payer: IAuthor;
  amount: Cents;
  note: string | null;
  /** "expired" is derived: pending and now >= expiresAt. */
  status: PaymentRequestStatus;
  createdAt: string;
  /** createdAt + 7 days */
  expiresAt: string;
  respondedAt: string | null;
  transferId: string | null;
  conversationId: string | null;
}

export interface LedgerAudit {
  ok: boolean;
  wallets: number;
  transfers: number;
  /** Must equal totalBalance. */
  issued: Cents;
  totalBalance: Cents;
  mismatches: { username: string; stored: Cents; computed: Cents }[];
  /** balance < 0 */
  negative: string[];
  /** pending > balance */
  pendingOverBalance: string[];
  /** Reversed twice, reversal of a reversal, amount/parties mismatch. */
  badReversals: string[];
}
