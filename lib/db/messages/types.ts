import { Cents } from "../../../types/Money";
import {
  ChannelRole,
  IChannel,
  IConversation,
  IMessage,
  IMessagePage,
} from "../../../types/Message";
import { IAuthor } from "../../../types/User";
import { IPaymentRequest, ITransfer } from "../../../types/Wallet";
import { FeatureRepository, IdempotentInput, MoneyResult } from "../types";

// Skeleton declared by the foundation; the messages lane implements
// MessagesRepository and the channels lane ChannelsRepository.

export interface NewMessage extends IdempotentInput {
  conversationId: string;
  author: IAuthor;
  /** "" allowed only with tweetId. */
  text: string;
  tweetId?: string | null;
  storyId?: string | null;
}

export interface ChatMoneyInput extends IdempotentInput {
  conversationId: string;
  from: IAuthor;
  amount: Cents;
  note: string | null;
}

export interface MessageQuery {
  before?: string | null;
  after?: string | null;
  limit?: number;
}

export interface MessagesRepository extends FeatureRepository {
  /** F-declared (activity); stub 0. */
  unreadConversations(username: string): Promise<number>;
  /** Direct only, by updatedAt desc. */
  listConversations(username: string): Promise<IConversation[]>;
  /** null if not a member. */
  getConversation(id: string, viewer: string): Promise<IConversation | null>;
  /** The existing direct conversation between two users, or null. Never writes. */
  findDirect(a: string, b: string): Promise<IConversation | null>;
  /** Deterministic id dm-<lowerA>-<lowerB> (sorted); creates conversation + 2 members + business greeting in one write; idempotent. */
  openDirect(
    viewer: IAuthor,
    other: IAuthor
  ): Promise<{ conversation: IConversation; created: boolean }>;
  /** NotFoundError for unknown conversations and for direct conversations the viewer is not in. Channels are readable by anyone. */
  listMessages(
    conversationId: string,
    viewer: string,
    query?: MessageQuery
  ): Promise<IMessagePage>;
  /** Member-only (ForbiddenError for channel non-members); NotFoundError for a missing tweet or story. */
  sendMessage(
    input: NewMessage
  ): Promise<{ message: IMessage; replayed: boolean }>;
  /** Transfer to the other member + payment message in ONE commit; direct only (InvalidStateError for channels). */
  sendPayment(
    input: ChatMoneyInput
  ): Promise<MoneyResult & { message: IMessage; transfer: ITransfer }>;
  /** Payment request (payer = other member) + request message in ONE commit; direct only. */
  sendRequest(input: ChatMoneyInput): Promise<{
    message: IMessage;
    request: IPaymentRequest;
    replayed: boolean;
  }>;
  /** lastReadAt = max(existing, now); no-op for non-members. */
  markRead(conversationId: string, username: string): Promise<void>;
}

export interface NewChannel {
  owner: IAuthor;
  handle: string;
  name: string;
  description: string | null;
}

export interface ChannelsRepository extends FeatureRepository {
  listChannels(
    query: { member?: string; search?: string },
    viewer: string | null
  ): Promise<IChannel[]>;
  getChannel(handle: string, viewer: string | null): Promise<IChannel | null>;
  /** ConflictError (handle taken; exact via create of channel-<handle>), LimitExceededError (3 per owner; read-checked). */
  createChannel(input: NewChannel): Promise<IChannel>;
  /** Idempotent join/leave; the owner cannot leave (InvalidStateError). */
  setMembership(
    handle: string,
    user: IAuthor,
    member: boolean
  ): Promise<{ channel: IChannel; changed: boolean }>;
  /** Owner only (checked by the caller); NotFoundError for non-members. */
  setRole(
    handle: string,
    username: string,
    role: "moderator" | "member"
  ): Promise<IChannel>;
  listMembers(handle: string): Promise<{ user: IAuthor; role: ChannelRole }[]>;
  /** Marks a message removed. Authorization (author, owner, moderator) is checked by the caller. Idempotent. */
  removeMessage(
    messageId: string,
    by: "author" | "moderator"
  ): Promise<boolean>;
}
