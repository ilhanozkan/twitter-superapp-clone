import { useRouter } from "next/router";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { HiXMark } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { messagesApi } from "../../lib/client/messagesApi";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { textLength } from "../../lib/constants";
import { LIMITS } from "../../lib/superapp/limits";
import {
  conversationOpened,
  fetchInbox,
  messageAdded,
} from "../../slices/messagesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import { conversationPath } from "./Inbox";
import UserCombobox from "./UserCombobox";

interface NewMessageDialogProps {
  open: boolean;
  /** Share this Tweet ("Send via Direct Message") instead of starting a chat. */
  tweetId: string | null;
  onClose: () => void;
}

/** People from the viewer's recent conversations, newest first. */
function useRecentPeople(): IAuthor[] {
  const items = useAppSelector((state) => state.messages.inbox.items);
  return useMemo(() => items.map((item) => item.other), [items]);
}

/** Recipient picker, then the Tweet with an optional comment. */
function ShareTweet({
  tweetId,
  onClose,
}: {
  tweetId: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const tweet = useAppSelector((state) => state.tweets.entities[tweetId]);
  const recent = useRecentPeople();
  const [recipient, setRecipient] = useState<IAuthor | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const commentId = useId();
  const errorId = useId();
  const text = comment.trim();
  const tooLong = textLength(text) > LIMITS.messageMax;
  // One key per recipient and comment: a retry after a lost answer posts once.
  const { key, rotate } = useIdempotencyKey([
    recipient?.username,
    text,
    tweetId,
  ]);

  useEffect(() => {
    if (recipient) field.current?.focus();
  }, [recipient]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!recipient || busy || tooLong) return;
    setBusy(true);
    setError(null);
    try {
      const { conversation } = await messagesApi.openConversation(
        recipient.username
      );
      dispatch(conversationOpened(conversation));
      const { message } = await messagesApi.sendMessage(
        conversation.id,
        { text, tweetId },
        key
      );
      dispatch(messageAdded(message));
      rotate();
      onClose();
      dispatch(
        showToast({
          message: `Sent to ${recipient.fullname}`,
          action: { label: "View", href: conversationPath(conversation.id) },
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  if (!viewer) return null;

  return (
    <form onSubmit={send} className="flex flex-col gap-4" aria-busy={busy}>
      {recipient ? (
        <div>
          <p className="text-[15px] font-bold">To</p>
          <div className="mt-1 flex items-center gap-3 rounded-full border border-line py-1 pl-1 pr-2">
            <Avatar user={recipient} size={32} />
            <span className="min-w-0 flex-1 truncate leading-5">
              <span className="font-bold">{recipient.fullname}</span>{" "}
              <span className="text-muted">@{recipient.username}</span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${recipient.fullname}`}
              onClick={() => setRecipient(null)}
              className="rounded-full p-1.5 text-lg transition-colors hover:bg-fg/10"
            >
              <HiXMark aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <UserCombobox
          label="To"
          suggestions={recent}
          exclude={viewer.username}
          onSelect={setRecipient}
        />
      )}

      {tweet && (
        <figure className="rounded-2xl border border-line p-3 text-[15px]">
          <figcaption className="flex min-w-0 items-center gap-2 leading-5">
            <Avatar user={tweet.author} size={20} />
            <span className="truncate font-bold">{tweet.author.fullname}</span>
            <span className="truncate text-muted">
              @{tweet.author.username}
            </span>
          </figcaption>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap leading-5 [overflow-wrap:anywhere]">
            {tweet.text}
          </p>
        </figure>
      )}

      <div>
        <label htmlFor={commentId} className="block text-[15px] font-bold">
          Add a comment{" "}
          <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          ref={field}
          id={commentId}
          rows={2}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          aria-invalid={tooLong}
          aria-describedby={error ? errorId : undefined}
          className="mt-1 block w-full resize-none rounded-md border border-line bg-transparent px-3 py-2 text-[15px] focus:border-primary focus:outline-none aria-[invalid=true]:border-danger"
        />
        {tooLong && (
          <p className="mt-1 text-[13px] text-danger">
            Comments are up to {LIMITS.messageMax.toLocaleString("en-US")}{" "}
            characters.
          </p>
        )}
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-danger px-3 py-2 text-[15px] text-danger"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!recipient || busy || tooLong}
        aria-busy={busy}
      >
        {busy ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}

/** Pick someone, then continue in their conversation (a draft until the first send). */
function StartConversation({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const recent = useRecentPeople();
  if (!viewer) return null;

  return (
    <UserCombobox
      label="To"
      suggestions={recent}
      exclude={viewer.username}
      onSelect={(user) => {
        onClose();
        router.push(`/messages?to=${encodeURIComponent(user.username)}`);
      }}
    />
  );
}

/**
 * "New message" (the inbox, the Messages page) and "Send via Direct
 * Message" (a Tweet's menu, with its `tweetId`). Recent conversations are
 * offered before anything is typed.
 */
export default function NewMessageDialog({
  open,
  tweetId,
  onClose,
}: NewMessageDialogProps) {
  const dispatch = useAppDispatch();
  const inboxLoaded = useAppSelector((state) => state.messages.inbox.loaded);

  useEffect(() => {
    // Suggestions come from the inbox; pages outside Messages haven't read it.
    if (open && !inboxLoaded) dispatch(fetchInbox()).catch(() => {});
  }, [dispatch, open, inboxLoaded]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tweetId ? "Send Tweet" : "New message"}
      variant="sheet"
    >
      {tweetId ? (
        <ShareTweet tweetId={tweetId} onClose={onClose} />
      ) : (
        <StartConversation onClose={onClose} />
      )}
    </Dialog>
  );
}
