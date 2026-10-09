import { Cents } from "./Money";
import { StoryContent } from "./Story";
import { IAuthor } from "./User";
import { IPaymentRequest } from "./Wallet";

// Skeleton declared by the foundation; the messages lane completes it
// (IChannel is completed by the channels lane).

export type MessageBody =
  | {
      type: "text";
      text: string;
      /** null also when deleted */
      tweet: { id: string; author: IAuthor; text: string } | null;
      story: {
        id: string;
        author: IAuthor;
        preview: StoryContent | null;
      } | null;
    }
  | { type: "payment"; transferId: string; amount: Cents; note: string | null }
  | { type: "request"; request: IPaymentRequest }
  | { type: "removed"; by: "author" | "moderator" };

export interface IMessage {
  id: string;
  conversationId: string;
  author: IAuthor;
  createdAt: string;
  body: MessageBody;
}

export interface IMessagePage {
  /** Oldest → newest. */
  items: IMessage[];
  olderCursor: string | null;
  newestCursor: string | null;
  serverNow: string;
}

export interface IConversation {
  id: string;
  kind: "direct";
  other: IAuthor;
  lastMessage: IMessage | null;
  unread: number;
  otherReadAt: string | null;
  updatedAt: string;
}

export type ChannelRole = "owner" | "moderator" | "member";

export interface IChannel {
  id: string;
  kind: "channel";
  handle: string;
  name: string;
  description: string | null;
  owner: IAuthor;
  memberCount: number;
  lastMessage: IMessage | null;
  createdAt: string;
  viewer: { role: ChannelRole | null; unread: number };
}
