import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import { errorMessage } from "../../lib/client/api";
import { NewStoryContent, storiesApi } from "../../lib/client/storiesApi";
import { textLength } from "../../lib/constants";
import { isSafeImageUrl } from "../../lib/imageUrl";
import { STORY_BACKGROUNDS, STORY_LIMITS } from "../../lib/superapp/stories";
import { trayChanged } from "../../slices/storiesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { StoryBackground } from "../../types/Story";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import StoryCanvas from "./StoryCanvas";

type Kind = "text" | "image";

const TABS: { kind: Kind; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "image", label: "Photo" },
];

const FIELD =
  "w-full rounded-md border border-line bg-transparent px-3 py-2 text-[15px] placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-danger";

/** "Add to your story" (ui.dialog "storyComposer"), from the tray's "+" or Services. */
export default function StoryComposerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add to your story">
      <StoryComposer onDone={onClose} />
    </Dialog>
  );
}

/** "12/200", with the remaining count for screen readers near the limit. */
function Counter({ value, max }: { value: string; max: number }) {
  const length = textLength(value.trim());
  const remaining = max - length;
  return (
    <span
      className={`text-[13px] tabular-nums ${remaining < 0 ? "text-danger" : "text-muted"}`}
    >
      <span aria-hidden="true">
        {length}/{max}
      </span>
      <span className="sr-only">
        {remaining >= 0
          ? `${remaining} characters left`
          : `${-remaining} characters over the limit`}
      </span>
    </span>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-[13px] text-danger">
      {children}
    </p>
  );
}

/**
 * Text (≤200 characters on one of six backgrounds) or a photo (an image URL
 * like a Tweet's, required alt text, optional caption), with a live preview.
 * Problems show when Share is pressed, next to their field, which gets focus.
 */
function StoryComposer({ onDone }: { onDone: () => void }) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const [kind, setKind] = useState<Kind>("text");
  const [text, setText] = useState("");
  const [background, setBackground] = useState<StoryBackground>("blue");
  const [image, setImage] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const imageValue = image.trim();
  const problems = {
    text: !text.trim()
      ? "Write something for your story."
      : textLength(text.trim()) > STORY_LIMITS.textMax
        ? `Use at most ${STORY_LIMITS.textMax} characters.`
        : null,
    image: !imageValue
      ? "Add the photo's URL."
      : !isSafeImageUrl(imageValue)
        ? "Use an https:// URL or a path on this site."
        : null,
    alt: !alt.trim()
      ? "Alt text is required. Describe the photo for people who can’t see it."
      : textLength(alt.trim()) > STORY_LIMITS.altMax
        ? `Use at most ${STORY_LIMITS.altMax} characters.`
        : null,
    caption:
      textLength(caption.trim()) > STORY_LIMITS.captionMax
        ? `Use at most ${STORY_LIMITS.captionMax} characters.`
        : null,
  };
  const fields: (keyof typeof problems)[] =
    kind === "text" ? ["text"] : ["image", "alt", "caption"];
  // The URL is checked as it is typed, like the Tweet composer's; the rest
  // once Share is pressed.
  const shown = (field: keyof typeof problems) =>
    field === "image" && imageValue && problems.image
      ? problems.image
      : showErrors
        ? problems[field]
        : null;

  const content: NewStoryContent =
    kind === "text"
      ? { type: "text", text: text.trim(), background }
      : {
          type: "image",
          image: imageValue,
          alt: alt.trim(),
          caption: caption.trim() || null,
        };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const invalid = fields.find((field) => problems[field]);
    if (invalid) {
      setShowErrors(true);
      document.getElementById(`${id}-${invalid}`)?.focus();
      return;
    }

    inFlight.current = true;
    setPosting(true);
    setError(null);
    try {
      const { story } = await storiesApi.create(content);
      dispatch(trayChanged());
      dispatch(
        showToast({
          message: "Your story was shared.",
          action: viewer
            ? {
                label: "View",
                href: `/stories/${encodeURIComponent(viewer.username)}?story=${encodeURIComponent(story.id)}`,
              }
            : undefined,
        })
      );
      onDone();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      inFlight.current = false;
      setPosting(false);
    }
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index =
      (TABS.findIndex((tab) => tab.kind === kind) + step + TABS.length) %
      TABS.length;
    setKind(TABS[index].kind);
    tabs.current[index]?.focus();
  };

  const described = (field: keyof typeof problems, hint?: string) => {
    const ids = [hint, shown(field) ? `${id}-${field}-error` : null].filter(
      Boolean
    );
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <form onSubmit={submit} aria-busy={posting} className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Story type"
        className="flex border-b border-line"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.kind}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.kind}`}
            aria-selected={kind === tab.kind}
            aria-controls={`${id}-panel`}
            tabIndex={kind === tab.kind ? 0 : -1}
            onClick={() => setKind(tab.kind)}
            onKeyDown={onTabKeyDown}
            className={`flex-1 border-b-4 px-4 py-3 text-[15px] font-bold transition-colors hover:bg-fg/5 ${
              kind === tab.kind
                ? "border-primary text-fg"
                : "border-transparent text-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start">
        <div aria-hidden="true" className="mx-auto w-28 shrink-0 sm:w-36">
          <p className="mb-1 text-center text-[13px] text-muted">Preview</p>
          {kind === "text" || (imageValue && !problems.image) ? (
            <StoryCanvas
              content={
                content.type === "text"
                  ? { ...content, text: content.text || "Your story" }
                  : { ...content, caption: content.caption ?? null }
              }
              className="shadow-menu"
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-subtle p-3 text-center text-[13px] text-muted">
              Your photo shows here
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${kind}`}
          className="flex min-w-0 flex-1 flex-col gap-4"
        >
          {kind === "text" ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${id}-text`}
                    className="text-[15px] font-bold"
                  >
                    Story text
                  </label>
                  <Counter value={text} max={STORY_LIMITS.textMax} />
                </div>
                <textarea
                  id={`${id}-text`}
                  data-autofocus
                  rows={4}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="What’s on your mind?"
                  aria-invalid={!!shown("text")}
                  aria-describedby={described("text")}
                  className={`${FIELD} resize-none`}
                />
                {shown("text") && (
                  <FieldError id={`${id}-text-error`}>
                    {shown("text")}
                  </FieldError>
                )}
              </div>
              <fieldset>
                <legend className="mb-2 text-[15px] font-bold">
                  Background
                </legend>
                <div className="flex flex-wrap gap-2">
                  {STORY_BACKGROUNDS.map((option) => (
                    <label key={option.id} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`${id}-background`}
                        value={option.id}
                        checked={background === option.id}
                        onChange={() => setBackground(option.id)}
                        className="peer sr-only"
                      />
                      <span className="sr-only">{option.label}</span>
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: option.color }}
                        className="block h-9 w-9 rounded-full border-2 border-surface ring-2 ring-transparent transition-shadow peer-checked:ring-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <div>
                <label
                  htmlFor={`${id}-image`}
                  className="mb-1 block text-[15px] font-bold"
                >
                  Image URL
                </label>
                <input
                  id={`${id}-image`}
                  data-autofocus
                  // Not type="url": paths on this site are valid too.
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  value={image}
                  onChange={(event) => setImage(event.target.value)}
                  placeholder="https://… or /media/…"
                  aria-invalid={!!shown("image")}
                  aria-describedby={described("image")}
                  className={FIELD}
                />
                {shown("image") && (
                  <FieldError id={`${id}-image-error`}>
                    {shown("image")}
                  </FieldError>
                )}
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${id}-alt`}
                    className="text-[15px] font-bold"
                  >
                    Alt text
                  </label>
                  <Counter value={alt} max={STORY_LIMITS.altMax} />
                </div>
                <p
                  id={`${id}-alt-hint`}
                  className="mb-1 text-[13px] text-muted"
                >
                  Describe this photo for people who use screen readers.
                </p>
                <textarea
                  id={`${id}-alt`}
                  rows={3}
                  // Not `required`: the browser's own bubble would block
                  // the submit before this form explains the problem.
                  aria-required="true"
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  aria-invalid={!!shown("alt")}
                  aria-describedby={described("alt", `${id}-alt-hint`)}
                  className={`${FIELD} resize-none`}
                />
                {shown("alt") && (
                  <FieldError id={`${id}-alt-error`}>{shown("alt")}</FieldError>
                )}
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${id}-caption`}
                    className="text-[15px] font-bold"
                  >
                    Caption (optional)
                  </label>
                  <Counter value={caption} max={STORY_LIMITS.captionMax} />
                </div>
                <input
                  id={`${id}-caption`}
                  type="text"
                  autoComplete="off"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  aria-invalid={!!shown("caption")}
                  aria-describedby={described("caption")}
                  className={FIELD}
                />
                {shown("caption") && (
                  <FieldError id={`${id}-caption-error`}>
                    {shown("caption")}
                  </FieldError>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-[13px] text-muted">Disappears after 24 hours.</p>
      {error && (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" aria-disabled={posting}>
        {posting ? "Sharing…" : "Share to your story"}
      </Button>
    </form>
  );
}
