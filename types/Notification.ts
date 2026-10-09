import { Cents } from "./Money";
import { IAuthor } from "./User";

type TweetRef = { id: string; text: string };

interface Base {
  id: string;
  createdAt: string;
  actor: IAuthor;
}

export type INotification =
  | (Base & { type: "like" | "retweet"; tweet: TweetRef; reply: null })
  | (Base & {
      type: "reply";
      tweet: TweetRef;
      reply: { id: string; text: string };
    })
  | (Base & {
      type: "tip";
      /** null: the Tweet was deleted. */
      tweet: TweetRef | null;
      amount: Cents;
      transferId: string;
    })
  | (Base & {
      type: "payment";
      amount: Cents;
      note: string | null;
      transferId: string;
      conversationId: string | null;
    })
  | (Base & {
      type: "payment_request";
      amount: Cents;
      note: string | null;
      requestId: string;
      conversationId: string | null;
    })
  | (Base & {
      type: "request_paid" | "request_declined";
      amount: Cents;
      requestId: string;
      transferId: string | null;
    })
  | (Base & {
      type: "order";
      event: "received" | "delivered" | "cancelled";
      orderId: string;
      code: string;
      business: string;
    })
  | (Base & {
      type: "ride";
      event: "completed" | "cancelled";
      rideId: string;
      destination: string;
    });

export type NotificationType = INotification["type"];

/** Likes, Retweets and replies on the user's Tweets: the notifications every data source has. */
export type CoreNotification = Extract<
  INotification,
  { type: "like" | "retweet" | "reply" }
>;
