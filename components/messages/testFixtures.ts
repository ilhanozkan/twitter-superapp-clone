// Builders for the messages component tests (not shipped in any page).
import { ThreadState } from "../../slices/messagesSlice";
import { testViewer } from "../../test/render";
import {
  IConversation,
  IMessage,
  IMessagePage,
  MessageBody,
} from "../../types/Message";
import { IAuthor } from "../../types/User";
import { IPaymentRequest } from "../../types/Wallet";

export const viewer: IAuthor = testViewer;
export const sarah: IAuthor = {
  username: "sarahcodes",
  fullname: "Sarah Chen",
  image: null,
};
export const CONVERSATION_ID = "dm-illlhanozkan-sarahcodes";

/** 2026-10-09 at hh:mm UTC. */
export const at = (hhmm: string) => `2026-10-09T${hhmm}:00.000Z`;

export function message(
  id: string,
  author: IAuthor,
  createdAt: string,
  body: MessageBody | string
): IMessage {
  return {
    id,
    conversationId: CONVERSATION_ID,
    author,
    createdAt,
    body:
      typeof body === "string"
        ? { type: "text", text: body, tweet: null, story: null }
        : body,
  };
}

export function paymentRequest(
  overrides: Partial<IPaymentRequest> = {}
): IPaymentRequest {
  return {
    id: "seed-req01",
    requester: sarah,
    payer: viewer,
    amount: 450,
    note: "Coffee ☕",
    status: "pending",
    createdAt: at("07:00"),
    expiresAt: "2026-10-16T07:00:00.000Z",
    respondedAt: null,
    transferId: null,
    conversationId: CONVERSATION_ID,
    ...overrides,
  };
}

export function conversation(
  overrides: Partial<IConversation> = {}
): IConversation {
  return {
    id: CONVERSATION_ID,
    kind: "direct",
    other: sarah,
    lastMessage: null,
    unread: 0,
    otherReadAt: null,
    updatedAt: at("07:00"),
    ...overrides,
  };
}

export function page(
  items: IMessage[],
  overrides: Partial<IMessagePage> = {}
): IMessagePage {
  return {
    items,
    olderCursor: null,
    newestCursor: items.length ? `cursor-${items.at(-1)!.id}` : null,
    serverNow: at("12:00"),
    ...overrides,
  };
}

export function thread(
  messages: IMessage[],
  overrides: Partial<ThreadState> = {}
): ThreadState {
  return {
    conversation: conversation({ lastMessage: messages.at(-1) ?? null }),
    messages,
    olderCursor: null,
    newestCursor: messages.length ? `cursor-${messages.at(-1)!.id}` : null,
    serverNow: at("12:00"),
    ...overrides,
  };
}
