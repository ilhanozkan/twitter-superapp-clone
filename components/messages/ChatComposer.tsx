import { FormEvent, KeyboardEvent, useId, useRef, useState } from "react";
import { HiOutlinePaperAirplane, HiPlus } from "react-icons/hi2";
import { RiCoinLine, RiHandCoinLine } from "react-icons/ri";

import { textLength } from "../../lib/constants";
import { pluralize } from "../../lib/format";
import { LIMITS } from "../../lib/superapp/limits";
import Menu from "../common/Menu";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useMediaQuery } from "./useMediaQuery";

export type ChatMoneyMode = "send" | "request";

interface ChatComposerProps {
  /** Who the message goes to, for the field's label. */
  recipient: string;
  onSend: (text: string) => void;
  /** The "+" menu (Send credits, Request credits); omitted while money can't move here. */
  onMoney?: (mode: ChatMoneyMode) => void;
}

/** Characters left at which the count starts to show (and be announced). */
const WARN_AT = 50;

/**
 * The message box under a conversation: an auto-growing textarea where
 * Enter sends and Shift+Enter adds a line (a hint says so; on touch
 * screens Enter adds a line and the Send button sends), with the "+" menu
 * for credits. Sending is optimistic, so the box clears at once.
 */
export default function ChatComposer({
  recipient,
  onSend,
  onMoney,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  // Touch screens have no Shift key at hand: there Enter adds a line.
  const coarse = useMediaQuery("(pointer: coarse)");
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useIsomorphicLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "";
    if (!text || element.scrollHeight === 0) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);

  const trimmed = text.trim();
  const remaining = LIMITS.messageMax - textLength(trimmed);
  const canSend = trimmed.length > 0 && remaining >= 0;
  const count =
    trimmed.length > 0 && remaining <= WARN_AT
      ? remaining < 0
        ? `${pluralize(-remaining, "character")} over the limit`
        : `${pluralize(remaining, "character")} left`
      : "";

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setText("");
    field.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      coarse
    )
      return;
    event.preventDefault();
    send();
  };

  return (
    <form onSubmit={send} className="border-t border-line bg-surface px-3 py-2">
      <div className="flex items-end gap-1">
        {onMoney && (
          <Menu
            label="Send or request credits"
            placement="above"
            align="left"
            trigger={<HiPlus aria-hidden="true" />}
            triggerClassName="mb-0.5 flex h-10 w-10 items-center justify-center rounded-full text-xl text-primary transition-colors hover:bg-primary/10"
            items={[
              {
                label: "Send credits",
                icon: <RiCoinLine />,
                onSelect: () => onMoney("send"),
              },
              {
                label: "Request credits",
                icon: <RiHandCoinLine />,
                onSelect: () => onMoney("request"),
              },
            ]}
          />
        )}
        <div className="min-w-0 flex-1 rounded-2xl bg-subtle px-3 py-2">
          <label htmlFor={id} className="sr-only">
            Message {recipient}
          </label>
          <textarea
            ref={field}
            id={id}
            value={text}
            rows={1}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Start a new message"
            aria-describedby={`${id}-hint`}
            aria-invalid={remaining < 0}
            className="block max-h-40 w-full resize-none bg-transparent text-[15px] leading-5 placeholder:text-muted focus:outline-none"
          />
          <p id={`${id}-hint`} className="sr-only">
            {coarse
              ? "Use the Send button to send."
              : "Enter sends, Shift+Enter adds a new line."}
          </p>
        </div>
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          <HiOutlinePaperAirplane aria-hidden="true" />
        </button>
      </div>
      {/* Under the field, on the page's surface rather than `subtle`, where
          the dark theme's danger red falls short of 4.5:1. Lined up with the
          field's text, left of the Send button. */}
      {count && (
        <p
          aria-hidden="true"
          className={`mt-1 pr-14 text-right text-[13px] tabular-nums ${remaining < 0 ? "text-danger" : "text-muted"}`}
        >
          {count}
        </p>
      )}
      {/* Announced only near the limit, not on every keystroke. */}
      <span aria-live="polite" className="sr-only">
        {count}
      </span>
    </form>
  );
}
