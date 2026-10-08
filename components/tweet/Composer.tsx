import { FormEvent, useId, useState } from "react";
import { HiOutlinePhoto } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { textLength, TWEET_MAX_LENGTH } from "../../lib/constants";
import { postReply, postTweet } from "../../slices/tweetsSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";

interface ComposerProps {
  /** Reply to this tweet instead of posting a new one. */
  replyTo?: { tweetId: string; username: string };
  /** Focus the text box when shown in a dialog. */
  autoFocus?: boolean;
  onPosted?: () => void;
  id?: string;
}

/** Mirrors the server: https URLs or paths on this site. */
function isValidImageUrl(value: string) {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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

  if (!viewer || readOnly) return null;

  const trimmed = text.trim();
  const remaining = TWEET_MAX_LENGTH - textLength(trimmed);
  const imageValue = image.trim();
  const imageInvalid = !!imageValue && !isValidImageUrl(imageValue);
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
      } else {
        await dispatch(
          postTweet({ text: trimmed, image: imageValue || null })
        ).unwrap();
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
          id={fieldId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={label}
          rows={replyTo ? 2 : 3}
          data-autofocus={autoFocus || undefined}
          className="w-full resize-none bg-transparent py-2 text-xl leading-6 placeholder:text-muted focus:outline-none"
        />

        {showImage && !replyTo && (
          <div className="mb-2">
            <label htmlFor={`${fieldId}-image`} className="sr-only">
              Image URL
            </label>
            <input
              id={`${fieldId}-image`}
              type="url"
              inputMode="url"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="https://… image URL"
              aria-invalid={imageInvalid}
              className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-[15px] placeholder:text-muted focus:border-primary focus:outline-none"
            />
            {imageInvalid && (
              <p className="mt-1 text-[13px] text-red-600">
                Use an https:// URL or a path on this site.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mb-2 text-[13px] text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <div>
            {!replyTo && (
              <button
                type="button"
                aria-label={showImage ? "Remove image" : "Add image"}
                aria-pressed={showImage}
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
            {trimmed.length > 0 && (
              <span
                aria-live="polite"
                className={`text-[13px] tabular-nums ${
                  remaining < 0
                    ? "text-red-600"
                    : remaining <= 20
                      ? "text-amber-600"
                      : "text-muted"
                }`}
              >
                {remaining}
                <span className="sr-only"> characters left</span>
              </span>
            )}
            <Button type="submit" disabled={!canPost}>
              {posting ? "Posting…" : replyTo ? "Reply" : "Tweet"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
