import { Cents } from "./Money";
import { StoryContent } from "./Story";
import { IAuthor } from "./User";
import { IPaymentRequest, ITransfer, IWallet } from "./Wallet";

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

// Response bodies of /api/conversations/** (docs/api/messages.md).

export interface ConversationsResponse {
  items: IConversation[];
}

export interface ConversationResponse {
  conversation: IConversation;
}

export type MessagePageResponse = IMessagePage;

export interface MessageResponse {
  message: IMessage;
}

/** A payment in a conversation: its message, the transfer and the sender's wallet afterwards. */
export interface ChatPaymentResponse extends MessageResponse {
  transfer: ITransfer;
  wallet: IWallet;
}

/** A payment request in a conversation: its message and the request. */
export interface ChatRequestResponse extends MessageResponse {
  request: IPaymentRequest;
}

// Response bodies of /api/channels/** (docs/api/channels.md). Messages use
// the conversation shapes above.

export interface ChannelsResponse {
  items: IChannel[];
}

export interface ChannelResponse {
  channel: IChannel;
}

export interface IChannelMember {
  user: IAuthor;
  role: ChannelRole;
}

export interface ChannelMembersResponse {
  items: IChannelMember[];
}
