import { INotification } from "./Notification";
import { IPage } from "./Page";
import { IFeatures } from "./Superapp";
import { ITrend } from "./Trend";
import { IReply, ITweet } from "./Tweet";
import { IUserProfile } from "./User";

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
