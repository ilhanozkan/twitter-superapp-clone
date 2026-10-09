import { INotification } from "./Notification";
import { IPage } from "./Page";
import { IFeatures, ILiveActivity, IPlace } from "./Superapp";
import { ITrend } from "./Trend";
import { IReply, ITweet } from "./Tweet";
import { IUser, IUserProfile } from "./User";
import { IPaymentRequest, ITransfer, IWallet, IWalletLimits } from "./Wallet";

// Response bodies of the REST API (see docs/API.md).

export type TweetPageResponse = IPage<ITweet>;

export interface TweetResponse {
  tweet: ITweet;
}

export interface RepliesResponse {
  items: IReply[];
}

export interface ReplyResponse {
  reply: IReply;
}

export interface UserResponse {
  user: IUserProfile;
}

export interface MeResponse extends UserResponse {
  /** True when the server rejects writes (READ_ONLY=true). */
  readOnly: boolean;
  /** SuperApp features that are on for this deployment. */
  features: IFeatures;
  /** Businesses the current user can run: their own, plus delegations. */
  managedBusinesses: string[];
}

export interface TrendsResponse {
  items: ITrend[];
}

export interface NotificationsResponse {
  items: INotification[];
}

export interface UsersResponse {
  items: IUser[];
}

export interface WalletResponse {
  wallet: IWallet;
  limits: IWalletLimits;
  serverNow: string;
}

export type TransferPageResponse = IPage<ITransfer>;

export interface TransferResponse {
  transfer: ITransfer;
}

/** A send or top-up: the transfer and the acting user's wallet afterwards. */
export interface MoneyResponse extends TransferResponse {
  wallet: IWallet;
}

export interface TipResponse extends MoneyResponse {
  tweet: ITweet;
}

export interface PaymentRequestResponse {
  request: IPaymentRequest;
}

export interface PaymentRequestsResponse {
  items: IPaymentRequest[];
}

export interface PayRequestResponse extends MoneyResponse {
  request: IPaymentRequest;
}

export interface ActivityResponse {
  serverNow: string;
  /** Conversations with unread messages (0 while Messages is off). */
  unreadConversations: number;
  /** Notifications newer than `since`, at most 99. */
  newNotifications: number;
  live: ILiveActivity[];
}

export interface PlacesResponse {
  items: IPlace[];
}

export interface HealthResponse {
  status: "ok";
  dataSource: "memory" | "sanity";
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
    requestId: string;
  };
}
