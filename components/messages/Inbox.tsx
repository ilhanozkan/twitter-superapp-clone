import Link from "next/link";
import { RiMailAddLine } from "react-icons/ri";

import { usePolling } from "../../lib/client/usePolling";
import { fetchInbox } from "../../slices/messagesSlice";
import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IConversation } from "../../types/Message";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import RelativeTime from "../common/RelativeTime";
import PageHeader from "../layout/PageHeader";
import MessagesTabs from "./MessagesTabs";
import { previewText } from "./messageText";

/** How often the inbox refreshes while it is shown (§18 PR 7). */
export const INBOX_POLL_MS = 15_000;

interface InboxProps {
  /**
   * "page": the inbox is the page (an h1, the phone account menu, live
   * activity). "pane": the list beside a conversation on wide screens.
   */
  as: "page" | "pane";
  /** The conversation open beside the list, highlighted. */
  selectedId?: string | null;
  /** Refresh every 15 s; off while the list is hidden. */
  poll: boolean;
}

export const conversationPath = (id: string) =>
  `/messages/${encodeURIComponent(id)}`;

function NewMessageButton() {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      aria-label="New message"
      aria-haspopup="dialog"
      title="New message"
      onClick={() => dispatch(openDialog("newMessage"))}
      className="rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
    >
      <RiMailAddLine aria-hidden="true" />
    </button>
  );
}

function ConversationRow({
  conversation,
  viewer,
  selected,
}: {
  conversation: IConversation;
  viewer: string;
  selected: boolean;
}) {
  const { other, unread } = conversation;
  return (
    <li>
      <Link
        href={conversationPath(conversation.id)}
        aria-current={selected ? "page" : undefined}
        className={`flex items-center gap-3 border-r-2 px-4 py-3 outline-offset-[-2px] transition-colors hover:bg-fg/[0.03] ${
          selected ? "border-primary bg-subtle" : "border-transparent"
        }`}
      >
        <Avatar user={other} size={48} />
        <span className="min-w-0 flex-1 leading-5">
          <span className="flex min-w-0 items-baseline gap-1 text-[15px]">
            <span
              className={`truncate ${unread > 0 ? "font-extrabold" : "font-bold"}`}
            >
              {other.fullname}
            </span>
            <span className="min-w-0 truncate text-muted">
              @{other.username}
            </span>
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
            <span className="shrink-0 text-muted">
              <RelativeTime iso={conversation.updatedAt} />
            </span>
          </span>
          <span
            className={`block truncate text-[15px] ${unread > 0 ? "font-bold text-fg" : "text-muted"}`}
          >
            {previewText(conversation.lastMessage, viewer)}
          </span>
        </span>
        {unread > 0 && (
          <>
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary-fill"
            />
            <span className="sr-only">, unread</span>
          </>
        )}
      </Link>
    </li>
  );
}

/**
 * The viewer's direct conversations, most recently active first: unread
 * ones bold with a dot. Server-rendered, then refreshed every 15 s while
 * shown. Channels get a tab while that feature is on.
 */
export default function Inbox({ as, selectedId = null, poll }: InboxProps) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const channelsOn = useAppSelector((state) => state.session.features.channels);
  const { items, loaded, error } = useAppSelector(
    (state) => state.messages.inbox
  );

  usePolling(() => dispatch(fetchInbox()), {
    interval: INBOX_POLL_MS,
    enabled: poll && !!viewer,
  });

  if (!viewer) return null;
  const retry = () => dispatch(fetchInbox()).catch(() => {});

  return (
    <>
      {as === "page" ? (
        <PageHeader title="Messages" actions={<NewMessageButton />} />
      ) : (
        <div className="flex min-h-[53px] items-center gap-6 border-b border-line px-4">
          <h2 className="min-w-0 flex-1 truncate text-xl font-bold">
            Messages
          </h2>
          <div className="-mr-2">
            <NewMessageButton />
          </div>
        </div>
      )}

      {channelsOn && <MessagesTabs current="chats" />}

      <section
        aria-label="Conversations"
        className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {items.length > 0 ? (
          <ul>
            {items.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                viewer={viewer.username}
                selected={conversation.id === selectedId}
              />
            ))}
          </ul>
        ) : error && !loaded ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 p-8 text-center text-[15px] text-muted"
          >
            <p>{error}</p>
            <Button onClick={retry}>Retry</Button>
          </div>
        ) : (
          <div className="px-8 py-12">
            <h2 className="text-[31px] font-extrabold leading-9">
              Welcome to your inbox!
            </h2>
            <p className="mt-2 text-[15px] text-muted">
              Drop a line, share Tweets and send credits in private
              conversations.
            </p>
            <Button
              size="lg"
              className="mt-7"
              aria-haspopup="dialog"
              onClick={() => dispatch(openDialog("newMessage"))}
            >
              New message
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
