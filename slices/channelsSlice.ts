import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { errorMessage } from "../lib/client/api";
import { channelsApi, NewChannelBody } from "../lib/client/channelsApi";
import {
  channelConversationId,
  compareOldestFirst,
} from "../lib/superapp/messages";
import type { AppDispatch, RootState } from "../store";
import {
  IChannel,
  IChannelMember,
  IMessage,
  IMessagePage,
} from "../types/Message";
import {
  mergeMessages,
  OutgoingMessage,
  THREAD_PAGE_SIZE,
} from "./messagesSlice";

// Owned by the channels (B2) lane (§12.3): the /channels lists, the open
// channels (by handle) and their messages, and the member lists. Channel
// messages behave like a conversation's: polled, paged, and only plain
// text is optimistic.

/** The most a poll reads at once (the API's maximum). */
const POLL_PAGE_SIZE = 50;

export type ChannelTab = "mine" | "discover";

export interface ChannelListState {
  items: IChannel[];
  loaded: boolean;
  /** The last read failed (shown while there is nothing else to show). */
  error: string | null;
}

export interface ChannelThread {
  channel: IChannel;
  /** Oldest → newest, each id once. */
  messages: IMessage[];
  olderCursor: string | null;
  /** The server's clock at the last read. */
  serverNow: string;
}

export interface ChannelMembersState {
  items: IChannelMember[];
  status: "loading" | "loaded" | "failed";
  error: string | null;
}

export interface ChannelsState {
  /** "Your channels", most recently active first. */
  mine: ChannelListState;
  /** Every channel, the biggest first. */
  discover: ChannelListState;
  /** Open channels by handle. */
  threads: Record<string, ChannelThread>;
  /** Texts on their way (`conversationId` is the channel's). */
  outbox: OutgoingMessage[];
  members: Record<string, ChannelMembersState>;
}

const emptyList: ChannelListState = { items: [], loaded: false, error: null };

export const initialChannelsState: ChannelsState = {
  mine: emptyList,
  discover: emptyList,
  threads: {},
  outbox: [],
  members: {},
};

/** A list read on the server (null: the read failed). */
export function channelList(items: IChannel[] | null): ChannelListState {
  return {
    items: items ?? [],
    loaded: items !== null,
    error: items === null ? "Channels can’t be loaded right now." : null,
  };
}

/**
 * Store state for a channels page read on the server: the lists it read
 * (null: the read failed; left out: not read) and the open channel.
 */
export function channelsState({
  mine,
  discover,
  thread,
}: {
  mine?: IChannel[] | null;
  discover?: IChannel[] | null;
  thread?: { channel: IChannel; page: IMessagePage };
}): ChannelsState {
  const list = (items: IChannel[] | null | undefined) =>
    items === undefined ? emptyList : channelList(items);
  return {
    ...initialChannelsState,
    mine: list(mine),
    discover: list(discover),
    threads: thread
      ? {
          [thread.channel.handle]: {
            channel: thread.channel,
            messages: thread.page.items,
            olderCursor: thread.page.olderCursor,
            serverNow: thread.page.serverNow,
          },
        }
      : {},
  };
}

/** The handle of a channel's conversation id. */
const handleOf = (conversationId: string) =>
  conversationId.slice(channelConversationId("").length);

const byActivity = (a: IChannel, b: IChannel) => {
  const at = (channel: IChannel) =>
    channel.lastMessage?.createdAt ?? channel.createdAt;
  return compareOldestFirst(
    { createdAt: at(b), id: b.handle },
    { createdAt: at(a), id: a.handle }
  );
};

/**
 * A channel as the server now shows it: in its thread and both lists. A
 * channel you joined (or created) goes into "Your channels"; one you left
 * comes out.
 */
function updateChannel(state: ChannelsState, channel: IChannel) {
  const thread = state.threads[channel.handle];
  if (thread) thread.channel = channel;
  state.discover.items = state.discover.items.map((item) =>
    item.id === channel.id ? channel : item
  );
  const others = state.mine.items.filter((item) => item.id !== channel.id);
  state.mine.items = channel.viewer.role
    ? [...others, channel].sort(byActivity)
    : others;
}

function addMessage(state: ChannelsState, message: IMessage) {
  const thread = state.threads[handleOf(message.conversationId)];
  if (!thread) return;
  thread.messages = mergeMessages(thread.messages, [message]);
  thread.channel.lastMessage = thread.messages.at(-1) ?? null;
}

const channelsSlice = createSlice({
  name: "channels",
  initialState: initialChannelsState,
  reducers: {
    listLoaded(
      state,
      action: PayloadAction<{ tab: ChannelTab; items: IChannel[] }>
    ) {
      state[action.payload.tab] = channelList(action.payload.items);
    },
    listFailed(
      state,
      action: PayloadAction<{ tab: ChannelTab; error: string }>
    ) {
      state[action.payload.tab].error = action.payload.error;
    },
    channelUpdated(state, action: PayloadAction<IChannel>) {
      updateChannel(state, action.payload);
    },
    /** A poll: the channel as it is now and its newest messages, merged by id. */
    threadPolled(
      state,
      action: PayloadAction<{ channel: IChannel; page: IMessagePage }>
    ) {
      const { channel, page } = action.payload;
      const thread = state.threads[channel.handle];
      if (!thread) return;
      const known = new Set(thread.messages.map((message) => message.id));
      // More is new than one page holds: show the newest, like Timeline.
      const gap =
        page.olderCursor !== null &&
        thread.messages.length > 0 &&
        !page.items.some((message) => known.has(message.id));
      thread.messages = gap
        ? page.items
        : mergeMessages(thread.messages, page.items);
      if (gap) thread.olderCursor = page.olderCursor;
      thread.serverNow = page.serverNow;
      updateChannel(state, channel);
    },
    olderLoaded(
      state,
      action: PayloadAction<{ handle: string; page: IMessagePage }>
    ) {
      const { handle, page } = action.payload;
      const thread = state.threads[handle];
      if (!thread) return;
      thread.messages = mergeMessages(page.items, thread.messages);
      thread.olderCursor = page.olderCursor;
    },
    messageAdded(state, action: PayloadAction<IMessage>) {
      addMessage(state, action.payload);
    },
    messageRemoved(
      state,
      action: PayloadAction<{
        handle: string;
        messageId: string;
        by: "author" | "moderator";
      }>
    ) {
      const { handle, messageId, by } = action.payload;
      const thread = state.threads[handle];
      if (!thread) return;
      const removed = (message: IMessage): IMessage =>
        message.id === messageId && message.body.type !== "removed"
          ? { ...message, body: { type: "removed", by } }
          : message;
      thread.messages = thread.messages.map(removed);
      if (thread.channel.lastMessage) {
        thread.channel.lastMessage = removed(thread.channel.lastMessage);
      }
    },
    channelRead(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload];
      if (thread) thread.channel.viewer.unread = 0;
      for (const item of state.mine.items) {
        if (item.handle === action.payload) item.viewer.unread = 0;
      }
    },
    membersLoading(state, action: PayloadAction<string>) {
      const current = state.members[action.payload];
      state.members[action.payload] = {
        items: current?.items ?? [],
        status: "loading",
        error: null,
      };
    },
    membersLoaded(
      state,
      action: PayloadAction<{ handle: string; items: IChannelMember[] }>
    ) {
      state.members[action.payload.handle] = {
        items: action.payload.items,
        status: "loaded",
        error: null,
      };
    },
    membersFailed(
      state,
      action: PayloadAction<{ handle: string; error: string }>
    ) {
      const current = state.members[action.payload.handle];
      state.members[action.payload.handle] = {
        items: current?.items ?? [],
        status: "failed",
        error: action.payload.error,
      };
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
  listLoaded,
  listFailed,
  channelUpdated,
  threadPolled,
  olderLoaded,
  messageAdded,
  messageRemoved,
  channelRead,
  membersLoading,
  membersLoaded,
  membersFailed,
  textQueued,
  textFailed,
  textSent,
} = channelsSlice.actions;

// Thunks are plain functions (not createAsyncThunk), so a failure stays the
// ApiRequestError whose message the forms show.

type Thunk<T> = (
  dispatch: AppDispatch,
  getState: () => RootState
) => Promise<T>;

export const fetchChannels =
  (tab: ChannelTab): Thunk<void> =>
  async (dispatch) => {
    try {
      const { items } = await channelsApi.listChannels({
        member: tab === "mine",
      });
      dispatch(listLoaded({ tab, items }));
    } catch (reason) {
      dispatch(listFailed({ tab, error: errorMessage(reason) }));
      throw reason;
    }
  };

/**
 * What changed in an open channel: the channel (members, your role,
 * unread) and its newest page, merged by id. Always the newest page rather
 * than what came after the cursor, because a removal changes a message
 * that is already shown without adding one.
 */
export const pollChannel =
  (handle: string): Thunk<void> =>
  async (dispatch, getState) => {
    const before = getState().channels.threads[handle]?.channel;
    if (!before) return;
    const [{ channel }, page] = await Promise.all([
      channelsApi.getChannel(handle),
      channelsApi.listMessages(handle, { limit: POLL_PAGE_SIZE }),
    ]);
    // Changed meanwhile (say, left while the poll was out): the server may
    // have answered before that change, so keep what is shown until the
    // next poll rather than bring back a role the reader just gave up.
    const now = getState().channels.threads[handle]?.channel;
    dispatch(
      threadPolled({ channel: now && now !== before ? now : channel, page })
    );
  };

export const loadOlderChannel =
  (handle: string): Thunk<void> =>
  async (dispatch, getState) => {
    const cursor = getState().channels.threads[handle]?.olderCursor;
    if (!cursor) return;
    const page = await channelsApi.listMessages(handle, {
      before: cursor,
      limit: THREAD_PAGE_SIZE,
    });
    dispatch(olderLoaded({ handle, page }));
  };

export const markChannelRead =
  (handle: string): Thunk<void> =>
  async (dispatch) => {
    await channelsApi.markRead(handle);
    dispatch(channelRead(handle));
  };

/**
 * Like a conversation's text: shown as "Sending…" at once and "Not sent"
 * on failure, keeping its key so Retry can't post it twice.
 */
export const sendChannelText =
  ({
    handle,
    text,
    key,
  }: {
    handle: string;
    text: string;
    key: string;
  }): Thunk<IMessage> =>
  async (dispatch, getState) => {
    const queued = getState().channels.outbox.find((item) => item.key === key);
    dispatch(
      textQueued({
        key,
        conversationId: channelConversationId(handle),
        text,
        tweetId: null,
        createdAt: queued?.createdAt ?? new Date().toISOString(),
        status: "sending",
        error: null,
      })
    );
    try {
      const { message } = await channelsApi.sendMessage(handle, { text }, key);
      dispatch(textSent({ key, message }));
      return message;
    } catch (reason) {
      dispatch(textFailed({ key, error: errorMessage(reason) }));
      throw reason;
    }
  };

/** Deletes a message: `by` is how it reads afterwards (the server decides the same). */
export const removeChannelMessage =
  (
    handle: string,
    messageId: string,
    by: "author" | "moderator"
  ): Thunk<void> =>
  async (dispatch) => {
    await channelsApi.removeMessage(handle, messageId);
    dispatch(messageRemoved({ handle, messageId, by }));
  };

export const joinChannel =
  (handle: string): Thunk<IChannel> =>
  async (dispatch) => {
    const { channel } = await channelsApi.join(handle);
    dispatch(channelUpdated(channel));
    return channel;
  };

export const leaveChannel =
  (handle: string): Thunk<IChannel> =>
  async (dispatch) => {
    const { channel } = await channelsApi.leave(handle);
    dispatch(channelUpdated(channel));
    return channel;
  };

export const createChannel =
  (body: NewChannelBody): Thunk<IChannel> =>
  async (dispatch) => {
    const { channel } = await channelsApi.createChannel(body);
    dispatch(channelUpdated(channel));
    return channel;
  };

export const fetchMembers =
  (handle: string): Thunk<void> =>
  async (dispatch) => {
    dispatch(membersLoading(handle));
    try {
      const { items } = await channelsApi.listMembers(handle);
      dispatch(membersLoaded({ handle, items }));
    } catch (reason) {
      dispatch(membersFailed({ handle, error: errorMessage(reason) }));
      throw reason;
    }
  };

/** The owner makes a member a moderator (or a member again), then re-reads the list. */
export const setMemberRole =
  (
    handle: string,
    username: string,
    role: "moderator" | "member"
  ): Thunk<void> =>
  async (dispatch) => {
    const { channel } = await channelsApi.setRole(handle, username, role);
    dispatch(channelUpdated(channel));
    await dispatch(fetchMembers(handle));
  };

/**
 * Server-confirmed outcomes settle in the current page's store after a
 * navigation (see store.ts), so a join or send that finishes elsewhere
 * still shows.
 */
export const followsNavigation: string[] = [
  channelUpdated.type,
  messageAdded.type,
  messageRemoved.type,
  textSent.type,
];

export default channelsSlice.reducer;
