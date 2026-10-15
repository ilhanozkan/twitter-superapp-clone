import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { HiOutlinePhoto } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { textLength, TWEET_MAX_LENGTH } from "../../lib/constants";
import { isSafeImageUrl } from "../../lib/imageUrl";
import { postReply, postTweet } from "../../slices/tweetsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import { statusPath } from "./paths";

interface ComposerProps {
  /** Reply to this tweet instead of posting a new one. */
  replyTo?: { tweetId: string; username: string };
  /** Focus the text box when shown in a dialog. */
  autoFocus?: boolean;
  onPosted?: () => void;
  id?: string;
}

// useLayoutEffect resizes before paint; the server has no layout to measure.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const WARN_AT = 20;

/** Twitter's circular counter: the number appears near the limit. */
function CharCounter({ remaining }: { remaining: number }) {
  const progress = Math.min(
    1,
    (TWEET_MAX_LENGTH - remaining) / TWEET_MAX_LENGTH
  );
  const near = remaining <= WARN_AT;
  const radius = near ? 12 : 9;
  const circumference = 2 * Math.PI * radius;
  const color =
    remaining < 0 ? "text-danger" : near ? "text-warning" : "text-brand";

  // Visual only: the remaining count is announced by Composer's live region.
  return (
    <span
      aria-hidden="true"
      className="relative flex h-[30px] min-w-[30px] items-center justify-center"
    >
      {/* Over the limit, Twitter drops the ring and shows only the number. */}
      {remaining >= 0 && (
        <svg
          viewBox="0 0 30 30"
          className={`absolute inset-0 -rotate-90 ${color}`}
        >
          <circle
            cx="15"
            cy="15"
            r={radius}
            fill="none"
            strokeWidth="2.5"
            className="stroke-line"
          />
          <circle
            cx="15"
            cy="15"
            r={radius}
            fill="none"
            strokeWidth="2.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-150"
          />
        </svg>
      )}
      {near && (
        <span className={`relative text-[12px] tabular-nums ${color}`}>
          {remaining}
        </span>
      )}
    </span>
  );
}

export default function Composer({
  replyTo,
  autoFocus = false,
  onPosted,
  id,
}: ComposerProps) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [showImage, setShowImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow with the text instead of scrolling inside a small box. Empty, the
  // rows attribute sizes it; a closed dialog (display: none) has nothing to
  // measure yet.
  useIsomorphicLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "";
    if (!text || element.scrollHeight === 0) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);

  if (!viewer || readOnly) return null;

  const trimmed = text.trim();
  const remaining = TWEET_MAX_LENGTH - textLength(trimmed);
  const imageValue = image.trim();
  const imageInvalid = !!imageValue && !isSafeImageUrl(imageValue);
  const canPost =
    trimmed.length > 0 && remaining >= 0 && !imageInvalid && !posting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canPost) return;

    setPosting(true);
    setError(null);
    try {
      if (replyTo) {
        await dispatch(
          postReply({ tweetId: replyTo.tweetId, text: trimmed })
        ).unwrap();
        dispatch(showToast({ message: "Your reply was sent." }));
      } else {
        const tweet = await dispatch(
          postTweet({ text: trimmed, image: imageValue || null })
        ).unwrap();
        dispatch(
          showToast({
            message: "Your Tweet was sent.",
            action: { label: "View", href: statusPath(tweet) },
          })
        );
      }
      setText("");
      setImage("");
      setShowImage(false);
      onPosted?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPosting(false);
    }
  };

  const label = replyTo ? "Tweet your reply" : "What's happening?";

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form
      id={id}
      onSubmit={submit}
      className="flex gap-3 px-4 py-3"
      aria-busy={posting}
    >
      <Avatar user={viewer} />
      <div className="min-w-0 flex-1">
        {replyTo && (
          <p className="mb-1 text-[15px] text-muted">
            Replying to{" "}
            <span className="text-primary">@{replyTo.username}</span>
          </p>
        )}
        <label htmlFor={fieldId} className="sr-only">
          {replyTo ? "Reply text" : "Tweet text"}
        </label>
        <textarea
          ref={textarea}
          id={fieldId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={label}
          rows={replyTo ? 2 : 3}
          data-autofocus={autoFocus || undefined}
          className="max-h-[40dvh] w-full resize-none bg-transparent py-2 text-xl leading-6 placeholder:text-muted focus:outline-none"
        />

        {showImage && !replyTo && (
          <div className="mb-2">
            <label htmlFor={`${fieldId}-image`} className="sr-only">
              Image URL
            </label>
            <input
              id={`${fieldId}-image`}
              // Not type="url": paths on this site are valid too, and the
              // browser's own URL check would silently block the submit.
              type="text"
              inputMode="url"
              autoComplete="off"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="https://… image URL"
              aria-invalid={imageInvalid}
              aria-describedby={
                imageInvalid ? `${fieldId}-image-error` : undefined
              }
              className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-[15px] placeholder:text-muted focus:border-primary focus:outline-none"
            />
            {imageInvalid && (
              <p
                id={`${fieldId}-image-error`}
                className="mt-1 text-[13px] text-danger"
              >
                Use an https:// URL or a path on this site.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mb-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <div>
            {!replyTo && (
              <button
                type="button"
                aria-label={showImage ? "Remove image" : "Add image"}
                onClick={() => {
                  setShowImage((value) => !value);
                  setImage("");
                }}
                className="-ml-2 rounded-full p-2 text-xl text-primary transition-colors hover:bg-primary/10"
              >
                <HiOutlinePhoto aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {trimmed.length > 0 && <CharCounter remaining={remaining} />}
            {/* Always mounted, so screen readers announce changes to it; it
                speaks only near the limit, not on every keystroke. */}
            <span aria-live="polite" className="sr-only">
              {trimmed.length > 0 && remaining <= WARN_AT
                ? `${remaining} characters left`
                : ""}
            </span>
            <Button type="submit" disabled={!canPost}>
              {posting ? "Posting…" : replyTo ? "Reply" : "Tweet"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
