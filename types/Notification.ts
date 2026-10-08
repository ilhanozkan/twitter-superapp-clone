import { IAuthor } from "./User";

export type NotificationType = "like" | "retweet" | "reply";

export interface INotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  actor: IAuthor;
  tweet: { id: string; text: string };
  /** Set for "reply" notifications only. */
  reply: { id: string; text: string } | null;
}
