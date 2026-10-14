import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { RiCoinLine } from "react-icons/ri";

import { newIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { usePolling } from "../../lib/client/usePolling";
import {
  loadOlder,
  OutgoingMessage,
  pollThread,
  sendText,
} from "../../slices/messagesSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { useShell } from "../layout/shell";
import LiveActivityBanner from "../superapp/LiveActivityBanner";
import Notice from "../superapp/Notice";
import ChatComposer, { ChatMoneyMode } from "./ChatComposer";
import ChatMoneySheet from "./ChatMoneySheet";
import MessageList from "./MessageList";
import { useMarkRead } from "./useMarkRead";

/** How often an open conversation looks for new messages (§4.5). */
export const CONVERSATION_POLL_MS = 4_000;
/** Polls failing this many times in a row show a status line. */
const FAILURES_SHOWN = 2;

interface ConversationViewProps {
  /** The conversation's id; for a draft, the id its first send creates. */
  conversationId: string;
  other: IAuthor;
  /** The server's clock when the page was read (a draft has no thread yet). */
  serverNow: string;
}

function ConversationHeader({
  other,
  headingId,
  onSendCredits,
}: {
  other: IAuthor;
  headingId: string;
  onSendCredits?: () => void;
}) {
  const { layout } = useShell();
  return (
    <div className="border-b border-line bg-surface">
      <div className="flex min-h-[53px] items-center gap-3 px-4 py-1.5">
        <Link
          href="/messages"
          aria-label="Back to Messages"
          className="-ml-2 rounded-full p-2 text-xl transition-colors hover:bg-fg/10 lg:hidden"
        >
          <HiArrowLeft aria-hidden="true" />
        </Link>
        <h1 id={headingId} className="min-w-0 flex-1">
          <Link
            href={`/${other.username}`}
            className="flex min-w-0 items-center gap-3 rounded-md"
          >
            <Avatar user={other} size={32} />
            <span className="min-w-0 leading-5">
              <span className="block truncate text-[17px] font-bold hover:underline">
                {other.fullname}
              </span>
              <span className="block truncate text-[13px] font-normal text-muted">
                @{other.username}
              </span>
            </span>
          </Link>
        </h1>
        {onSendCredits && (
          <button
            type="button"
            aria-label="Send credits"
            aria-haspopup="dialog"
            title="Send credits"
            onClick={onSendCredits}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-primary transition-colors hover:bg-primary/10"
          >
            <RiCoinLine aria-hidden="true" />
          </button>
        )}
      </div>
      <LiveActivityBanner className={layout === "wide" ? "" : "lg:hidden"} />
    </div>
  );
}

/**
 * One direct conversation: the header, the messages (polled every 4 s
 * while the tab is visible) and the composer, or the read-only notice. A
 * draft (from /messages?to=, nothing in the store yet) is created by its
 * first send, then behaves like any other conversation.
 */
export default function ConversationView({
  conversationId,
  other,
  serverNow,
}: ConversationViewProps) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const walletOn = useAppSelector((state) => state.session.features.wallet);
  const thread = useAppSelector(
    (state) => state.messages.threads[conversationId]
  );
  const allOutgoing = useAppSelector((state) => state.messages.outbox);
  const outbox = useMemo(
    () => allOutgoing.filter((item) => item.conversationId === conversationId),
    [allOutgoing, conversationId]
  );
  const [money, setMoney] = useState<ChatMoneyMode | null>(null);
  const headingId = useId();
  const exists = !!thread;
  // While it is a draft, the first send (of any kind) opens it.
  const openWith = exists ? undefined : other.username;

  const { failures } = usePolling(() => dispatch(pollThread(conversationId)), {
    interval: CONVERSATION_POLL_MS,
    enabled: exists,
  });
  useMarkRead(thread?.conversation ?? null, exists && !readOnly);

  const send = (text: string, key = newIdempotencyKey()) => {
    // The bubble shows "Not sent · Retry" on failure: nothing else to do.
    dispatch(sendText({ conversationId, text, key, openWith })).catch(() => {});
  };
  const retry = (item: OutgoingMessage) => send(item.text, item.key);
  const moneyOn = walletOn && !readOnly;

  if (!viewer) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ConversationHeader
        other={other}
        headingId={headingId}
        onSendCredits={moneyOn ? () => setMoney("send") : undefined}
      />
      <MessageList
        other={other}
        viewer={viewer.username}
        messages={thread?.messages ?? []}
        outbox={outbox}
        otherReadAt={thread?.conversation.otherReadAt ?? null}
        serverNow={thread?.serverNow ?? serverNow}
        hasOlder={!!thread?.olderCursor}
        onLoadOlder={() => dispatch(loadOlder(conversationId))}
        onRetry={retry}
      />
      <p role="status" className="px-4 text-center text-[13px] text-muted">
        {failures >= FAILURES_SHOWN ? "Can’t load new messages. Retrying…" : ""}
      </p>
      {readOnly ? (
        <div className="border-t border-line">
          <Notice tone="info">
            Messaging is turned off on this read-only demo.
          </Notice>
        </div>
      ) : (
        <ChatComposer
          recipient={other.fullname}
          onSend={send}
          onMoney={moneyOn ? setMoney : undefined}
        />
      )}
      <ChatMoneySheet
        mode={money}
        other={other}
        conversationId={conversationId}
        openWith={openWith}
        onClose={() => setMoney(null)}
      />
    </section>
  );
}
