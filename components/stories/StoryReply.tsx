import Link from "next/link";
import { FormEvent, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { storiesApi } from "../../lib/client/storiesApi";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { textLength } from "../../lib/constants";
import { LIMITS } from "../../lib/superapp/limits";
import { IStory } from "../../types/Story";
import { Button } from "../common/Button";
import { firstName } from "./storyText";

/**
 * "Reply to Mert…": sends a direct message to the story's author with the
 * story attached (§3.2, the messages API). The viewer pauses while the
 * field has focus, and shows it only while Messages is on and writable.
 */
export default function StoryReply({
  story,
  onFocusChange,
  onNavigate,
}: {
  story: IStory;
  onFocusChange: (focused: boolean) => void;
  /** A link out of the viewer was followed (it should close). */
  onNavigate: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const { key, rotate } = useIdempotencyKey([story.id, text]);
  const inFlight = useRef(false);
  const fieldId = useId();
  const errorId = useId();

  const trimmed = text.trim();
  const tooLong = textLength(trimmed) > LIMITS.messageMax;
  const { author } = story;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || tooLong || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const conversationId = await storiesApi.reply(
        author.username,
        story.id,
        trimmed,
        key
      );
      rotate();
      setText("");
      setSent(conversationId);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      aria-busy={sending}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onFocusChange(false);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <label htmlFor={fieldId} className="sr-only">
          Reply to {author.fullname}
        </label>
        <input
          id={fieldId}
          type="text"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSent(null);
          }}
          placeholder={`Reply to ${firstName(author.fullname)}…`}
          aria-invalid={tooLong || !!error}
          aria-describedby={error || tooLong ? errorId : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 text-[15px] placeholder:text-muted focus:border-primary focus:outline-none"
        />
        <Button
          type="submit"
          // Not `disabled`: the button pressed to send would drop focus to
          // the page (and out of the viewer) while it sends. `submit`
          // ignores it while there's nothing to send or it's on its way.
          aria-disabled={!trimmed || tooLong || sending}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      {(error || tooLong) && (
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {tooLong
            ? `Replies can be at most ${LIMITS.messageMax} characters.`
            : error}
        </p>
      )}
      <p role="status" className="text-[13px] text-muted empty:hidden">
        {sent && (
          <>
            Reply sent.{" "}
            <Link
              href={`/messages/${encodeURIComponent(sent)}`}
              onClick={onNavigate}
              className="font-bold text-primary underline underline-offset-2"
            >
              View in Messages
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
