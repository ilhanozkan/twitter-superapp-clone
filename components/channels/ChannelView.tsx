import { useEffect, useId, useMemo, useRef, useState } from "react";
import { HiOutlineTrash } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { newIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { usePolling } from "../../lib/client/usePolling";
import { channelConversationId } from "../../lib/superapp/messages";
import { removalBy } from "../../lib/superapp/policy/messages";
import {
  loadOlderChannel,
  markChannelRead,
  pollChannel,
  removeChannelMessage,
  sendChannelText,
} from "../../slices/channelsSlice";
import { OutgoingMessage } from "../../slices/messagesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IMessage } from "../../types/Message";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import ChatComposer from "../messages/ChatComposer";
import MessageList, { MessageAction } from "../messages/MessageList";
import { isMine } from "../messages/messageText";
import { useMarkRead } from "../messages/useMarkRead";
import Notice from "../superapp/Notice";
import ChannelHeader from "./ChannelHeader";
import JoinBar from "./JoinBar";
import MembersDrawer from "./MembersDrawer";

/** How often an open channel looks for new messages (§18 PR 8). */
export const CHANNEL_POLL_MS = 4_000;
/** Polls failing this many times in a row show a status line. */
const FAILURES_SHOWN = 2;

type Removal = { message: IMessage; by: "author" | "moderator" };

/** Where focus goes once what the reader used has been replaced. */
type FocusTarget = "composer" | "join" | "log";

function DeleteDialog({
  handle,
  removal,
  onClose,
  onDeleted,
}: {
  handle: string;
  removal: Removal | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!removal || busy) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch(
        removeChannelMessage(handle, removal.message.id, removal.by)
      );
      onDeleted();
      dispatch(
        showToast({
          message:
            removal.by === "author" ? "Message deleted" : "Message removed",
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!removal}
      onClose={onClose}
      title="Delete message?"
      className="max-w-xs"
    >
      <p className="text-[15px] text-muted">
        Everyone in #{handle} will see “
        {removal?.by === "moderator"
          ? "Message removed by a moderator"
          : "Message deleted"}
        ” in its place. This can’t be undone.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3">
        <Button
          size="lg"
          data-autofocus
          className="bg-red-600 text-white hover:bg-red-700"
          aria-disabled={busy}
          onClick={confirm}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
        <Button variant="outline" size="lg" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * One channel: the header, the messages (polled every 4 s while the tab is
 * visible) with each author named, and the composer for members, "Join to
 * send messages" for everyone else, or the read-only notice. Authors can
 * delete their messages, and owners and moderators anyone's.
 */
export default function ChannelView({ handle }: { handle: string }) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const thread = useAppSelector((state) => state.channels.threads[handle]);
  const allOutgoing = useAppSelector((state) => state.channels.outbox);
  const conversationId = channelConversationId(handle);
  const outbox = useMemo(
    () => allOutgoing.filter((item) => item.conversationId === conversationId),
    [allOutgoing, conversationId]
  );
  const [info, setInfo] = useState(false);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const focusTarget = useRef<FocusTarget | null>(null);
  const headingId = useId();
  const section = useRef<HTMLElement>(null);

  const channel = thread?.channel ?? null;
  const role = channel?.viewer.role ?? null;

  const { failures } = usePolling(() => dispatch(pollChannel(handle)), {
    interval: CHANNEL_POLL_MS,
    enabled: !!thread,
  });
  const readable = useMemo(
    () => (channel ? { id: handle, unread: channel.viewer.unread } : null),
    [handle, channel]
  );
  useMarkRead(readable, !readOnly && role !== null, markChannelRead);

  // Joining swaps the Join buttons for the composer, leaving does the
  // reverse, and deleting takes the message's Delete button away: move
  // focus to what took their place. It may already be on screen when asked
  // for, or only after the next render (or once the confirm dialog has
  // closed, as nothing outside a modal dialog can take focus), so it is
  // tried now and after every render until it lands.
  const moveFocus = () => {
    const wanted = focusTarget.current;
    const root = section.current;
    if (!wanted || !root) return;
    const target =
      wanted === "composer"
        ? root.querySelector("textarea")
        : wanted === "join"
          ? [...root.querySelectorAll("button")].find((button) =>
              button.textContent?.startsWith("Join")
            )
          : root.querySelector<HTMLElement>('[role="log"]');
    target?.focus();
    if (target && document.activeElement === target) {
      focusTarget.current = null;
    }
  };
  useEffect(moveFocus);

  const focusNext = (target: FocusTarget) => {
    focusTarget.current = target;
    moveFocus();
  };

  if (!viewer || !thread || !channel) return null;

  const send = (text: string, key = newIdempotencyKey()) => {
    // The bubble shows "Not sent · Retry" on failure: nothing else to do.
    dispatch(sendChannelText({ handle, text, key })).catch(() => {});
  };
  const retry = (item: OutgoingMessage) => send(item.text, item.key);

  const actionsFor = (message: IMessage): MessageAction[] => {
    if (readOnly || message.body.type === "removed") return [];
    const by = removalBy(role, isMine(message.author, viewer.username));
    return by
      ? [
          {
            label: "Delete message",
            icon: <HiOutlineTrash />,
            onSelect: () => setRemoval({ message, by }),
          },
        ]
      : [];
  };

  return (
    <section
      ref={section}
      aria-labelledby={headingId}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ChannelHeader
        channel={channel}
        headingId={headingId}
        onInfo={() => setInfo(true)}
        onJoined={() => focusNext("composer")}
        onLeft={() => focusNext("join")}
      />
      <MessageList
        label={`Messages in #${handle}`}
        empty={
          <div className="px-8 py-16 text-center">
            <h2 className="text-[23px] font-extrabold leading-7 [overflow-wrap:anywhere]">
              No messages in #{handle} yet
            </h2>
            <p className="mt-2 text-[15px] text-muted">
              {role
                ? "Say something to get the conversation going."
                : "Join to start the conversation."}
            </p>
          </div>
        }
        viewer={viewer.username}
        messages={thread.messages}
        outbox={outbox}
        otherReadAt={null}
        serverNow={thread.serverNow}
        hasOlder={!!thread.olderCursor}
        onLoadOlder={() => dispatch(loadOlderChannel(handle))}
        onRetry={retry}
        showAuthors
        actionsFor={actionsFor}
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
      ) : role ? (
        <ChatComposer recipient={`#${handle}`} onSend={send} />
      ) : (
        <JoinBar channel={channel} onJoined={() => focusNext("composer")} />
      )}
      <MembersDrawer
        channel={channel}
        open={info}
        onClose={() => setInfo(false)}
      />
      <DeleteDialog
        handle={handle}
        removal={removal}
        onClose={() => setRemoval(null)}
        onDeleted={() => {
          focusNext("log");
          setRemoval(null);
        }}
      />
    </section>
  );
}
