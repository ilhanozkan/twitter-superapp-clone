import { useCallback, useEffect, useRef, useState } from "react";
import { HiArrowDown } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { compareOldestFirst } from "../../lib/superapp/messages";
import { OutgoingMessage } from "../../slices/messagesSlice";
import { IMessage } from "../../types/Message";
import { IAuthor } from "../../types/User";
import LocalTime from "../superapp/LocalTime";
import { useHydrated } from "../superapp/useHydrated";
import { groupByDay } from "./dayGroups";
import MessageBubble, { TextBubble } from "./MessageBubble";
import { isMine } from "./messageText";
import { useBatchedAnnouncements } from "./useBatchedAnnouncements";

interface MessageListProps {
  other: IAuthor;
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
}

type Row =
  | { kind: "message"; id: string; createdAt: string; message: IMessage }
  | { kind: "outgoing"; id: string; createdAt: string; item: OutgoingMessage };

/** Within this many pixels of the newest message counts as reading it. */
const AT_END_PX = 48;

/** Text (and removed) bubbles don't say who wrote them; the others do. */
const namesAuthor = (message: IMessage) =>
  message.body.type === "payment" || message.body.type === "request";

/**
 * A conversation's messages as a chat log (`role="log"`), grouped by day,
 * mine on the right. It opens at the newest message: the scroller is
 * `flex-col-reverse`, so the browser starts it at the end and "Load older"
 * adds above without moving what is on screen. Messages that arrive while
 * the reader is scrolled up show a "New messages" pill instead of moving
 * the view, and are announced politely in batches (at most one every 5 s).
 */
export default function MessageList({
  other,
  viewer,
  messages,
  outbox,
  otherReadAt,
  serverNow,
  hasOlder,
  onLoadOlder,
  onRetry,
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
  const seen = useRef<{ ids: Set<string>; newest?: IMessage } | null>(null);
  const outboxSize = useRef(outbox.length);

  // In a column-reverse scroller the end is scrollTop 0 (standard, negative
  // upwards), so "at the end" is a small distance from 0 either way.
  const atEnd = () => Math.abs(scroller.current?.scrollTop ?? 0) <= AT_END_PX;
  const scrollToEnd = useCallback(() => {
    scroller.current?.scrollTo?.({ top: 0 });
    setPill(false);
  }, []);

  // What is new since the last render: other people's messages are
  // announced (and shown with the pill when scrolled up); the viewer's own
  // (a confirmed payment, say) bring the view to the end.
  useEffect(() => {
    const before = seen.current;
    const newest = messages.at(-1);
    seen.current = { ids: new Set(messages.map((m) => m.id)), newest };
    if (!before) return;

    const fresh = messages.filter(
      (message) =>
        !before.ids.has(message.id) &&
        (!before.newest || compareOldestFirst(before.newest, message) < 0)
    );
    const incoming = fresh.filter((m) => !isMine(m.author, viewer));
    announce(incoming.map((message) => message.author.fullname));
    if (fresh.length > incoming.length) scrollToEnd();
    else if (incoming.length > 0 && !atEnd()) setPill(true);
  }, [messages, viewer, announce, scrollToEnd]);

  // A text the viewer just sent goes to the end, wherever they were.
  useEffect(() => {
    if (outbox.length > outboxSize.current) scrollToEnd();
    outboxSize.current = outbox.length;
  }, [outbox.length, scrollToEnd]);

  // "Load older" goes away at the first message: keep focus in the log.
  useEffect(() => {
    if (!hasOlder && focusLog.current) scroller.current?.focus();
    focusLog.current = false;
  }, [hasOlder]);

  const loadOlder = async () => {
    if (older.loading) return;
    setOlder({ loading: true, error: null });
    try {
      focusLog.current = true;
      await onLoadOlder();
      setOlder({ loading: false, error: null });
    } catch (reason) {
      focusLog.current = false;
      setOlder({ loading: false, error: errorMessage(reason) });
    }
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
        aria-label={`Messages with ${other.fullname}`}
        tabIndex={0}
        onScroll={() => {
          if (atEnd()) setPill(false);
        }}
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain outline-offset-[-2px]"
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

          {rows.length === 0 && (
            <div className="px-8 py-16 text-center">
              <h2 className="text-[23px] font-extrabold leading-7 [overflow-wrap:anywhere]">
                Say hi to {other.fullname} 👋
              </h2>
              <p className="mt-2 text-[15px] text-muted">
                Messages, shared Tweets and credits you send here are only
                between the two of you.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <section key={`${group.label}-${group.items[0].id}`}>
              <h2 className="px-4 pb-2 pt-4 text-center text-[13px] font-bold text-muted">
                {group.label}
              </h2>
              <ol className="flex flex-col gap-2">
                {group.items.map((row) =>
                  row.kind === "message" ? (
                    <MessageRow
                      key={row.id}
                      message={row.message}
                      viewer={viewer}
                      seen={seenLast && row.message === lastMine}
                    />
                  ) : (
                    <OutgoingRow
                      key={row.id}
                      item={row.item}
                      onRetry={onRetry}
                    />
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

function MessageRow({
  message,
  viewer,
  seen,
}: {
  message: IMessage;
  viewer: string;
  seen: boolean;
}) {
  const mine = isMine(message.author, viewer);
  return (
    <li
      className={`group flex flex-col gap-0.5 px-4 ${mine ? "items-end" : "items-start"}`}
    >
      {!namesAuthor(message) && (
        <span className="sr-only">
          {mine ? "You" : message.author.fullname}:
        </span>
      )}
      <MessageBubble message={message} viewer={viewer} />
      <span className="sr-only text-[13px] text-muted group-focus-within:not-sr-only group-hover:not-sr-only">
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
