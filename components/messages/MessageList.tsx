import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { HiArrowDown, HiEllipsisHorizontal } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { compareOldestFirst } from "../../lib/superapp/messages";
import { OutgoingMessage } from "../../slices/messagesSlice";
import { IMessage } from "../../types/Message";
import { IAuthor } from "../../types/User";
import { PaymentRequestStatus } from "../../types/Wallet";
import Avatar from "../common/Avatar";
import Menu, { MenuItem } from "../common/Menu";
import LocalTime from "../superapp/LocalTime";
import { useHydrated } from "../superapp/useHydrated";
import { groupByDay } from "./dayGroups";
import MessageBubble, { TextBubble } from "./MessageBubble";
import { isMine, requestChangeText } from "./messageText";
import { useBatchedAnnouncements } from "./useBatchedAnnouncements";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

interface MessageListProps {
  /**
   * A direct conversation's other member: the log and its empty state are
   * named after them. Any other conversation (a channel) passes `label`
   * and `empty` instead.
   */
  other?: IAuthor;
  /** The log's accessible name, e.g. "Messages in #ankara_eats". */
  label?: string;
  /** What shows while there are no messages. */
  empty?: ReactNode;
  viewer: string;
  /** Oldest → newest. */
  messages: IMessage[];
  /** The viewer's texts on their way, after the messages. */
  outbox: OutgoingMessage[];
  /** When the other member last read the conversation: "Seen". */
  otherReadAt: string | null;
  /** The server's clock at the last read (day labels before hydration). */
  serverNow: string;
  hasOlder: boolean;
  onLoadOlder: () => Promise<void>;
  onRetry: (item: OutgoingMessage) => void;
  /** Group chats: each run of messages by someone else starts with their name. */
  showAuthors?: boolean;
  /** What the viewer can do to a message (a channel's Delete), in a "…" menu. */
  actionsFor?: (message: IMessage) => MenuItem[];
}

type Row =
  | { kind: "message"; id: string; createdAt: string; message: IMessage }
  | { kind: "outgoing"; id: string; createdAt: string; item: OutgoingMessage };

/** Within this many pixels of the newest message counts as reading it. */
const AT_END_PX = 48;

/** Text (and removed) bubbles don't say who wrote them; the others do. */
const namesAuthor = (message: IMessage) =>
  message.body.type === "payment" || message.body.type === "request";

/** What a render showed, to tell what is new in the next one. */
interface Shown {
  ids: Set<string>;
  oldest?: IMessage;
  /** Status of each request shown, by request id. */
  requests: Map<string, PaymentRequestStatus>;
}

function shown(messages: IMessage[]): Shown {
  const requests = new Map<string, PaymentRequestStatus>();
  for (const { body } of messages) {
    if (body.type === "request")
      requests.set(body.request.id, body.request.status);
  }
  return {
    ids: new Set(messages.map((m) => m.id)),
    oldest: messages[0],
    requests,
  };
}

/**
 * A conversation's messages as a chat log (`role="log"`), grouped by day,
 * mine on the right. It opens at the newest message: the scroller is
 * `flex-col-reverse`, so the browser starts it at the end, and "Load older"
 * puts the reader's offset from the end back after adding above. Messages
 * that arrive while the reader is scrolled up show a "New messages" pill
 * instead of moving the view. Arrivals, and requests the other member
 * answers (or that expire), are announced politely in batches (at most one
 * every 5 s).
 */
export default function MessageList({
  other,
  label,
  empty,
  viewer,
  messages,
  outbox,
  otherReadAt,
  serverNow,
  hasOlder,
  onLoadOlder,
  onRetry,
  showAuthors = false,
  actionsFor,
}: MessageListProps) {
  const hydrated = useHydrated();
  const scroller = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState(false);
  const [older, setOlder] = useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: false, error: null });
  const focusLog = useRef(false);
  const { text: announcement, announce } = useBatchedAnnouncements();
  const seen = useRef<Shown | null>(null);
  const outboxSize = useRef(outbox.length);
  // Where the reader was when they asked for older messages (kept up to
  // date while it loads), and the oldest message shown then.
  const place = useRef<{ top: number; oldest?: string } | null>(null);

  // In a column-reverse scroller the end is scrollTop 0 (standard, negative
  // upwards), so "at the end" is a small distance from 0 either way.
  const atEnd = () => Math.abs(scroller.current?.scrollTop ?? 0) <= AT_END_PX;
  const scrollToEnd = useCallback(() => {
    scroller.current?.scrollTo?.({ top: 0 });
    setPill(false);
  }, []);

  // What is new since the last render: other people's messages are
  // announced (and shown with the pill when scrolled up); the viewer's own
  // (a confirmed payment, say) bring the view to the end. Older pages are
  // not new; a message that committed late, dated among those shown, is.
  // A request someone else answered (or that expired) is announced too.
  useEffect(() => {
    const before = seen.current;
    seen.current = shown(messages);
    if (!before) return;

    const fresh = messages.filter(
      (message) =>
        !before.ids.has(message.id) &&
        (!before.oldest || compareOldestFirst(before.oldest, message) < 0)
    );
    const incoming = fresh.filter((m) => !isMine(m.author, viewer));
    const changes = messages.flatMap(({ body }) => {
      if (body.type !== "request") return [];
      const was = before.requests.get(body.request.id);
      if (!was || was === body.request.status) return [];
      return requestChangeText(body.request, viewer) ?? [];
    });
    announce(
      incoming.map((message) => message.author.fullname),
      changes
    );
    if (fresh.length > incoming.length) scrollToEnd();
    else if (incoming.length > 0 && !atEnd()) setPill(true);
  }, [messages, viewer, announce, scrollToEnd]);

  // Chrome's scroll anchoring holds the top of the list (the Load older
  // button) still while the older page goes in above, which would push
  // what the reader was looking at down by the page's height. In a
  // column-reverse scroller the same scrollTop is the same distance from
  // the newest message, so putting it back keeps their place.
  useIsomorphicLayoutEffect(() => {
    const element = scroller.current;
    if (!place.current || !element) return;
    if (messages[0]?.id === place.current.oldest) return;
    element.scrollTop = place.current.top;
    place.current = null;
  }, [messages]);

  // A text the viewer just sent goes to the end, wherever they were.
  useEffect(() => {
    if (outbox.length > outboxSize.current) scrollToEnd();
    outboxSize.current = outbox.length;
  }, [outbox.length, scrollToEnd]);

  // "Load older" goes away at the first message: keep focus in the log.
  // (An empty last page added nothing, so there is no place to keep.)
  useEffect(() => {
    if (!hasOlder && focusLog.current) scroller.current?.focus();
    focusLog.current = false;
    if (!hasOlder) place.current = null;
  }, [hasOlder]);

  const loadOlder = async () => {
    if (older.loading) return;
    setOlder({ loading: true, error: null });
    place.current = {
      top: scroller.current?.scrollTop ?? 0,
      oldest: messages[0]?.id,
    };
    try {
      focusLog.current = true;
      await onLoadOlder();
      setOlder({ loading: false, error: null });
    } catch (reason) {
      focusLog.current = false;
      place.current = null;
      setOlder({ loading: false, error: errorMessage(reason) });
    }
  };

  // Retry swaps "Not sent · Retry" for "Sending…": keep focus in the log
  // rather than losing it with the button.
  const retry = (item: OutgoingMessage) => {
    onRetry(item);
    scroller.current?.focus();
  };

  const rows: Row[] = [
    ...messages.map((message): Row => ({
      kind: "message",
      id: message.id,
      createdAt: message.createdAt,
      message,
    })),
    ...outbox.map((item): Row => ({
      kind: "outgoing",
      id: item.key,
      createdAt: item.createdAt,
      item,
    })),
  ];
  // "Today" by the server's clock, refreshed with every poll.
  const groups = groupByDay(
    rows,
    Date.parse(serverNow),
    hydrated ? undefined : "UTC"
  );
  const lastMine = [...messages]
    .reverse()
    .find((message) => isMine(message.author, viewer));
  const seenLast =
    !!lastMine &&
    outbox.length === 0 &&
    otherReadAt !== null &&
    Date.parse(otherReadAt) >= Date.parse(lastMine.createdAt);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        role="log"
        // Arrivals are announced in batches below, not one by one.
        aria-live="off"
        aria-label={
          other ? `Messages with ${other.fullname}` : (label ?? "Messages")
        }
        tabIndex={0}
        onScroll={() => {
          if (atEnd()) setPill(false);
          if (place.current && scroller.current)
            place.current.top = scroller.current.scrollTop;
        }}
        // While the log itself has keyboard focus every time shows, since
        // a text without links has nothing inside to focus.
        className="group/log flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain outline-offset-[-2px]"
      >
        <div className="pb-4">
          {hasOlder && (
            <div className="flex flex-col items-center gap-2 p-3">
              <button
                type="button"
                aria-disabled={older.loading}
                onClick={loadOlder}
                className="rounded-full px-4 py-2 text-[15px] font-bold text-primary transition-colors hover:bg-primary/10 aria-disabled:cursor-progress"
              >
                {older.loading ? "Loading…" : "Load older messages"}
              </button>
              {older.error && (
                <p role="alert" className="text-[13px] text-danger">
                  {older.error}
                </p>
              )}
            </div>
          )}

          {rows.length === 0 &&
            (other ? (
              <div className="px-8 py-16 text-center">
                <h2 className="text-[23px] font-extrabold leading-7 [overflow-wrap:anywhere]">
                  Say hi to {other.fullname} 👋
                </h2>
                <p className="mt-2 text-[15px] text-muted">
                  Messages, shared Tweets and credits you send here are only
                  between the two of you.
                </p>
              </div>
            ) : (
              empty
            ))}

          {groups.map((group) => (
            <section key={`${group.label}-${group.items[0].id}`}>
              <h2 className="px-4 pb-2 pt-4 text-center text-[13px] font-bold text-muted">
                {group.label}
              </h2>
              <ol className="flex flex-col gap-2">
                {group.items.map((row, index) =>
                  row.kind === "message" ? (
                    <MessageRow
                      key={row.id}
                      message={row.message}
                      viewer={viewer}
                      seen={seenLast && row.message === lastMine}
                      named={
                        showAuthors && startsRun(group.items, index, viewer)
                      }
                      actions={actionsFor?.(row.message) ?? []}
                    />
                  ) : (
                    <OutgoingRow key={row.id} item={row.item} onRetry={retry} />
                  )
                )}
              </ol>
            </section>
          ))}
        </div>
      </div>

      {pill && (
        <button
          type="button"
          onClick={() => {
            scrollToEnd();
            scroller.current?.focus();
          }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary-fill px-4 py-2 text-[15px] font-bold text-white shadow-lg hover:bg-primary-fill-hover"
        >
          New messages <HiArrowDown aria-hidden="true" />
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/**
 * Whether the message at `index` starts a run by someone other than the
 * viewer: the first of its day, or after a message by someone else.
 */
function startsRun(rows: Row[], index: number, viewer: string): boolean {
  const row = rows[index];
  if (row.kind !== "message" || isMine(row.message.author, viewer)) {
    return false;
  }
  const before = rows[index - 1];
  return (
    before?.kind !== "message" ||
    before.message.author.username.toLowerCase() !==
      row.message.author.username.toLowerCase()
  );
}

function MessageRow({
  message,
  viewer,
  seen,
  named,
  actions,
}: {
  message: IMessage;
  viewer: string;
  seen: boolean;
  /** Show the author above (the first of their run in a group chat). */
  named: boolean;
  actions: MenuItem[];
}) {
  const mine = isMine(message.author, viewer);
  const bubble = <MessageBubble message={message} viewer={viewer} />;
  return (
    <li
      className={`group flex flex-col gap-0.5 px-4 ${mine ? "items-end" : "items-start"} ${named ? "pt-2" : ""}`}
    >
      {/* Screen readers hear the author with every message (below). */}
      {named && (
        <span
          aria-hidden="true"
          className="flex max-w-full items-center gap-1.5 text-[13px] font-bold text-muted"
        >
          <Avatar user={message.author} size={20} />
          <span className="truncate">{message.author.fullname}</span>
        </span>
      )}
      {!namesAuthor(message) && (
        <span className="sr-only">
          {mine ? "You" : message.author.fullname}:
        </span>
      )}
      {actions.length > 0 ? (
        <div
          className={`flex max-w-full items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}
        >
          <div className="min-w-0">{bubble}</div>
          <Menu
            label="Message options"
            strategy="fixed"
            placement="above"
            align={mine ? "right" : "left"}
            items={actions}
            trigger={<HiEllipsisHorizontal aria-hidden="true" />}
            triggerClassName="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary"
          />
        </div>
      ) : (
        bubble
      )}
      <span className="sr-only text-[13px] text-muted group-focus-within:not-sr-only group-hover:not-sr-only group-focus-visible/log:not-sr-only">
        <LocalTime iso={message.createdAt} />
      </span>
      {seen && <span className="text-[13px] text-muted">Seen</span>}
    </li>
  );
}

function OutgoingRow({
  item,
  onRetry,
}: {
  item: OutgoingMessage;
  onRetry: (item: OutgoingMessage) => void;
}) {
  const sending = item.status === "sending";
  return (
    <li className="flex flex-col items-end gap-0.5 px-4">
      <span className="sr-only">You:</span>
      <TextBubble
        text={item.text}
        mine
        className={sending ? "opacity-70" : ""}
      />
      {sending ? (
        <span className="text-[13px] text-muted">Sending…</span>
      ) : (
        <span className="flex items-center gap-1 text-[13px] text-danger">
          <span role="alert">Not sent</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onRetry(item)}
            className="font-bold underline underline-offset-2"
          >
            Retry
          </button>
        </span>
      )}
    </li>
  );
}
