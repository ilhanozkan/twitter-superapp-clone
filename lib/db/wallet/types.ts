import { Cents } from "../../../types/Money";
import { IPage } from "../../../types/Page";
import { IAuthor } from "../../../types/User";
import {
  IPaymentRequest,
  ITransfer,
  IWallet,
  IWalletLimits,
  LedgerAudit,
  PaymentRequestStatus,
  TransferContext,
} from "../../../types/Wallet";
import {
  FeatureRepository,
  IdempotentInput,
  MoneyResult,
  PageQuery,
} from "../types";

export interface SendInput extends IdempotentInput {
  kind: "payment" | "tip";
  from: IAuthor;
  to: IAuthor;
  amount: Cents;
  note: string | null;
  context: Extract<
    TransferContext,
    { type: "tweet" | "conversation" | "ride" }
  > | null;
}

export interface TopUpInput extends IdempotentInput {
  to: IAuthor;
  amount: Cents;
}

export interface NewPaymentRequest extends IdempotentInput {
  requester: IAuthor;
  payer: IAuthor;
  amount: Cents;
  note: string | null;
  conversationId: string | null;
}

export interface PayRequestInput extends IdempotentInput {
  id: string;
  payer: IAuthor;
}

export interface RequestQuery {
  role: "incoming" | "outgoing";
  status?: PaymentRequestStatus;
}

export interface WalletRepository extends FeatureRepository {
  getWallet(username: string): Promise<IWallet>;
  getLimits(username: string): Promise<IWalletLimits>;
  /** Transfers from or to `username`, newest first, cursor (createdAt, id). */
  listActivity(username: string, query?: PageQuery): Promise<IPage<ITransfer>>;
  /** Policy decides visibility. */
  getTransfer(id: string): Promise<ITransfer | null>;
  /** InsufficientFundsError, WalletFrozenError, IdempotencyKeyReusedError, LimitExceededError (ledger full). */
  send(input: SendInput): Promise<MoneyResult & { transfer: ITransfer }>;
  /** LimitExceededError (amount not allowed, cap, 3 per 24 h; exact via lock), WalletFrozenError. */
  topUp(input: TopUpInput): Promise<MoneyResult & { transfer: ITransfer }>;
  /** LimitExceededError (10 pending outgoing; exact via lock on the requester). */
  createRequest(
    input: NewPaymentRequest
  ): Promise<{ request: IPaymentRequest; replayed: boolean }>;
  getRequest(id: string): Promise<IPaymentRequest | null>;
  listRequests(
    username: string,
    query: RequestQuery
  ): Promise<IPaymentRequest[]>;
  /** InvalidStateError unless pending and not expired (revision-guarded); the payer must match (NotFoundError otherwise). */
  payRequest(
    input: PayRequestInput
  ): Promise<MoneyResult & { request: IPaymentRequest; transfer: ITransfer }>;
  /** decline = payer, cancel = requester; same action again is a no-op; incompatible → InvalidStateError. */
  closeRequest(
    id: string,
    actor: string,
    action: "decline" | "cancel"
  ): Promise<{ request: IPaymentRequest; changed: boolean }>;
  tipStats(
    tweetIds: string[],
    viewer: string | null
  ): Promise<Map<string, { tips: number; tipped: boolean }>>;
  audit(): Promise<LedgerAudit>;
}
