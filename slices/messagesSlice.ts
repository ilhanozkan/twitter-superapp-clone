import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { errorMessage } from "../lib/client/api";
import { messagesApi } from "../lib/client/messagesApi";
import { walletApi } from "../lib/client/walletApi";
import { compareOldestFirst } from "../lib/superapp/messages";
import type { AppDispatch, RootState } from "../store";
import { Cents } from "../types/Money";
import { IConversation, IMessage, IMessagePage } from "../types/Message";
import { IPaymentRequest, ITransfer } from "../types/Wallet";
import { fetchActivity } from "./activitySlice";
import { balanceChanged } from "./walletSlice";

/** Messages a conversation page starts with, and each "Load older" adds. */
export const THREAD_PAGE_SIZE = 30;
/** The most a poll reads at once (the API's maximum). */
const POLL_PAGE_SIZE = 50;

export interface ThreadState {
  conversation: IConversation;
  /** Oldest → newest, each id once. */
  messages: IMessage[];
  olderCursor: string | null;
  /** Where the next poll reads from; null until the server was read. */
  newestCursor: string | null;
  /** The server's clock at the last read. */
  serverNow: string;
}

/** A text message on its way: shown at once, posted with its own key. */
export interface OutgoingMessage {
  /** The Idempotency-Key: a retry sends it again, so the text posts once. */
  key: string;
  conversationId: string;
  text: string;
  tweetId: string | null;
  createdAt: string;
  status: "sending" | "failed";
  error: string | null;
}

export interface InboxState {
  /** Most recently active first. */
  items: IConversation[];
  loaded: boolean;
  /** The last read failed (shown while there is nothing else to show). */
  error: string | null;
}

export interface MessagesState {
  inbox: InboxState;
  /** Open conversations by id. */
  threads: Record<string, ThreadState>;
  outbox: OutgoingMessage[];
}

export const initialMessagesState: MessagesState = {
  inbox: { items: [], loaded: false, error: null },
  threads: {},
  outbox: [],
};

/** A conversation page's thread from the server's first read. */
export function threadFromPage(
  conversation: IConversation,
  page: IMessagePage
): ThreadState {
  return {
    conversation,
    messages: page.items,
    olderCursor: page.olderCursor,
    newestCursor: page.newestCursor,
    serverNow: page.serverNow,
  };
}

/** Store state for a messages page read on the server (`inbox` null: the read failed). */
export function messagesState(
  inbox: IConversation[] | null,
  thread?: ThreadState
): MessagesState {
  return {
    inbox: {
      items: inbox ?? [],
      loaded: inbox !== null,
      error: inbox === null ? "Your conversations can’t be loaded." : null,
    },
    threads: thread ? { [thread.conversation.id]: thread } : {},
    outbox: [],
  };
}

/** Both lists merged by id (`incoming` wins), oldest first. */
export function mergeMessages(
  existing: IMessage[],
  incoming: IMessage[]
): IMessage[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareOldestFirst);
}

/** A request whose status can still change without a new message. */
export const isPendingRequest = (message: IMessage) =>
  message.body.type === "request" && message.body.request.status === "pending";

const byActivity = (a: IConversation, b: IConversation) =>
  compareOldestFirst(
    { createdAt: b.updatedAt, id: b.id },
    { createdAt: a.updatedAt, id: a.id }
  );

function upsertConversation(state: MessagesState, conversation: IConversation) {
  const items = state.inbox.items.filter((item) => item.id !== conversation.id);
  state.inbox.items = [...items, conversation].sort(byActivity);
}

/** A confirmed message: into its thread, and the inbox row's preview. */
function addMessage(state: MessagesState, message: IMessage) {
  const thread = state.threads[message.conversationId];
  if (thread) {
    thread.messages = mergeMessages(thread.messages, [message]);
    thread.conversation.lastMessage = thread.messages.at(-1) ?? null;
  }
  const row = state.inbox.items.find(
    (item) => item.id === message.conversationId
  );
  if (
    row &&
    (!row.lastMessage || compareOldestFirst(row.lastMessage, message) <= 0)
  ) {
    upsertConversation(state, {
      ...row,
      lastMessage: message,
      updatedAt: message.createdAt,
    });
  }
}

function withRequest(message: IMessage, request: IPaymentRequest): IMessage {
  return message.body.type === "request" &&
    message.body.request.id === request.id
    ? { ...message, body: { type: "request", request } }
    : message;
}

const messagesSlice = createSlice({
  name: "messages",
  initialState: initialMessagesState,
  reducers: {
    inboxLoaded(state, action: PayloadAction<IConversation[]>) {
      state.inbox = { items: action.payload, loaded: true, error: null };
    },
    inboxFailed(state, action: PayloadAction<string>) {
      state.inbox.error = action.payload;
    },
    /** Opened (or found) by a POST: listed in the inbox, and ready to show. */
    conversationOpened(state, action: PayloadAction<IConversation>) {
      const conversation = action.payload;
      upsertConversation(state, conversation);
      state.threads[conversation.id] ??= {
        conversation,
        messages: [],
        olderCursor: null,
        newestCursor: null,
        serverNow: new Date().toISOString(),
      };
    },
    /**
     * A poll: the conversation as it is now (read marker, unread) and its
     * messages. A `latest` page (the newest messages, not what came after
     * the cursor) that doesn't overlap what is shown means too much is new
     * to join without a gap, so it replaces it, like Timeline.
     */
    threadPolled(
      state,
      action: PayloadAction<{
        conversation: IConversation;
        page: IMessagePage;
        latest: boolean;
      }>
    ) {
      const { conversation, page, latest } = action.payload;
      const thread = state.threads[conversation.id];
      if (!thread) return;
      const known = new Set(thread.messages.map((message) => message.id));
      const firstRead = thread.newestCursor === null;
      const gap =
        latest &&
        !firstRead &&
        page.olderCursor !== null &&
        !page.items.some((message) => known.has(message.id));

      thread.conversation = conversation;
      thread.serverNow = page.serverNow;
      thread.messages = gap
        ? page.items
        : mergeMessages(thread.messages, page.items);
      if (gap || firstRead) thread.olderCursor = page.olderCursor;
      thread.newestCursor = page.newestCursor ?? thread.newestCursor;
      if (state.inbox.items.some((item) => item.id === conversation.id))
        upsertConversation(state, conversation);
    },
    olderLoaded(
      state,
      action: PayloadAction<{ conversationId: string; page: IMessagePage }>
    ) {
      const { conversationId, page } = action.payload;
      const thread = state.threads[conversationId];
      if (!thread) return;
      thread.messages = mergeMessages(page.items, thread.messages);
      thread.olderCursor = page.olderCursor;
    },
    messageAdded(state, action: PayloadAction<IMessage>) {
      addMessage(state, action.payload);
    },
    /** A request was paid, declined or cancelled: every bubble showing it. */
    requestUpdated(state, action: PayloadAction<IPaymentRequest>) {
      const request = action.payload;
      for (const thread of Object.values(state.threads)) {
        thread.messages = thread.messages.map((message) =>
          withRequest(message, request)
        );
      }
      for (const row of state.inbox.items) {
        if (row.lastMessage)
          row.lastMessage = withRequest(row.lastMessage, request);
      }
    },
    conversationRead(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload];
      if (thread) thread.conversation.unread = 0;
      const row = state.inbox.items.find((item) => item.id === action.payload);
      if (row) row.unread = 0;
    },
    textQueued(state, action: PayloadAction<OutgoingMessage>) {
      state.outbox = [
        ...state.outbox.filter((item) => item.key !== action.payload.key),
        action.payload,
      ];
    },
    textFailed(state, action: PayloadAction<{ key: string; error: string }>) {
      const item = state.outbox.find(
        (entry) => entry.key === action.payload.key
      );
      if (item) {
        item.status = "failed";
        item.error = action.payload.error;
      }
    },
    textSent(state, action: PayloadAction<{ key: string; message: IMessage }>) {
      state.outbox = state.outbox.filter(
        (item) => item.key !== action.payload.key
      );
      addMessage(state, action.payload.message);
    },
  },
});

export const {
  inboxLoaded,
  inboxFailed,
  conversationOpened,
  threadPolled,
  olderLoaded,
  messageAdded,
  requestUpdated,
  conversationRead,
  textQueued,
  textFailed,
  textSent,
} = messagesSlice.actions;

// Thunks are plain functions (not createAsyncThunk), so a failure stays the
// ApiRequestError whose `code` PaymentConfirm and the bubbles read.

type Thunk<T> = (
  dispatch: AppDispatch,
  getState: () => RootState
) => Promise<T>;

export const fetchInbox = (): Thunk<void> => async (dispatch) => {
  try {
    const { items } = await messagesApi.listConversations();
    dispatch(inboxLoaded(items));
  } catch (reason) {
    dispatch(inboxFailed(errorMessage(reason)));
    throw reason;
  }
};

/**
 * What changed in an open conversation: the conversation (the other
 * member's read marker, unread) and new messages. Request bubbles change
 * status without a new message, so while one is pending the poll reads the
 * newest page (statuses included) rather than only what is new.
 */
export const pollThread =
  (conversationId: string): Thunk<void> =>
  async (dispatch, getState) => {
    const thread = getState().messages.threads[conversationId];
    if (!thread) return;
    const latest =
      !thread.newestCursor || thread.messages.some(isPendingRequest);
    const [{ conversation }, page] = await Promise.all([
      messagesApi.getConversation(conversationId),
      messagesApi.listMessages(
        conversationId,
        latest
          ? { limit: POLL_PAGE_SIZE }
          : { after: thread.newestCursor, limit: POLL_PAGE_SIZE }
      ),
    ]);
    dispatch(threadPolled({ conversation, page, latest }));
  };

export const loadOlder =
  (conversationId: string): Thunk<void> =>
  async (dispatch, getState) => {
    const cursor = getState().messages.threads[conversationId]?.olderCursor;
    if (!cursor) return;
    const page = await messagesApi.listMessages(conversationId, {
      before: cursor,
      limit: THREAD_PAGE_SIZE,
    });
    dispatch(olderLoaded({ conversationId, page }));
  };

/** Marks the conversation read, then recounts the Messages badge. */
export const markThreadRead =
  (conversationId: string): Thunk<void> =>
  async (dispatch) => {
    await messagesApi.markRead(conversationId);
    dispatch(conversationRead(conversationId));
    void dispatch(fetchActivity());
  };

/**
 * A draft conversation is created by its first send (GET never writes):
 * `openWith` names the other person while it doesn't exist yet.
 */
async function ensureConversation(
  dispatch: AppDispatch,
  conversationId: string,
  openWith: string | undefined
): Promise<string> {
  if (!openWith) return conversationId;
  const { conversation } = await messagesApi.openConversation(openWith);
  dispatch(conversationOpened(conversation));
  return conversation.id;
}

export interface SendTextArgs {
  conversationId: string;
  text: string;
  tweetId?: string | null;
  /** The key of this message: Retry passes the same one. */
  key: string;
  openWith?: string;
}

/**
 * Chat text is the one optimistic write: it shows as "Sending…" at once and
 * "Not sent" on failure, keeping its key so Retry can't post it twice.
 */
export const sendText =
  ({
    conversationId,
    text,
    tweetId = null,
    key,
    openWith,
  }: SendTextArgs): Thunk<IMessage> =>
  async (dispatch, getState) => {
    const queued = getState().messages.outbox.find((item) => item.key === key);
    dispatch(
      textQueued({
        key,
        conversationId,
        text,
        tweetId,
        createdAt: queued?.createdAt ?? new Date().toISOString(),
        status: "sending",
        error: null,
      })
    );
    try {
      const id = await ensureConversation(dispatch, conversationId, openWith);
      const { message } = await messagesApi.sendMessage(
        id,
        { text, tweetId },
        key
      );
      dispatch(textSent({ key, message }));
      return message;
    } catch (reason) {
      dispatch(textFailed({ key, error: errorMessage(reason) }));
      throw reason;
    }
  };

export interface ChatMoneyArgs {
  conversationId: string;
  amount: Cents;
  note: string | null;
  key: string;
  openWith?: string;
}

/** Pays the other member. Never optimistic: the bubble comes from the server. */
export const sendChatPayment =
  ({
    conversationId,
    amount,
    note,
    key,
    openWith,
  }: ChatMoneyArgs): Thunk<{ message: IMessage; transfer: ITransfer }> =>
  async (dispatch) => {
    const id = await ensureConversation(dispatch, conversationId, openWith);
    const { message, transfer, wallet } = await messagesApi.sendPayment(
      id,
      { amount, note },
      key
    );
    dispatch(balanceChanged(wallet));
    dispatch(messageAdded(message));
    return { message, transfer };
  };

/** Asks the other member to pay. */
export const sendChatRequest =
  ({
    conversationId,
    amount,
    note,
    key,
    openWith,
  }: ChatMoneyArgs): Thunk<{ message: IMessage; request: IPaymentRequest }> =>
  async (dispatch) => {
    const id = await ensureConversation(dispatch, conversationId, openWith);
    const { message, request } = await messagesApi.sendRequest(
      id,
      { amount, note },
      key
    );
    dispatch(messageAdded(message));
    return { message, request };
  };

/** The payer pays a request shown in the chat. */
export const payChatRequest =
  (
    requestId: string,
    key: string
  ): Thunk<{ request: IPaymentRequest; transfer: ITransfer }> =>
  async (dispatch) => {
    const { request, transfer, wallet } = await walletApi.payRequest(
      requestId,
      key
    );
    dispatch(balanceChanged(wallet));
    dispatch(requestUpdated(request));
    return { request, transfer };
  };

/** The payer declines, or the requester cancels; repeating it is harmless. */
export const answerChatRequest =
  (requestId: string, answer: "decline" | "cancel"): Thunk<IPaymentRequest> =>
  async (dispatch) => {
    const { request } = await (answer === "decline"
      ? walletApi.declineRequest(requestId)
      : walletApi.cancelRequest(requestId));
    dispatch(requestUpdated(request));
    return request;
  };

/**
 * Server-confirmed outcomes settle in the current page's store after a
 * navigation (see store.ts), so a send that finishes elsewhere still shows.
 */
export const followsNavigation: string[] = [
  conversationOpened.type,
  messageAdded.type,
  requestUpdated.type,
  textSent.type,
];

export default messagesSlice.reducer;
