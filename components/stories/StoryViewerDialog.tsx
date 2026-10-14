import Link from "next/link";
import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  HiChevronLeft,
  HiChevronRight,
  HiEllipsisHorizontal,
  HiOutlineTrash,
  HiPause,
  HiPlay,
} from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { storiesApi } from "../../lib/client/storiesApi";
import {
  flushSeen,
  SEEN_FLUSH_MS,
  storySeen,
  trayChanged,
} from "../../slices/storiesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IStory } from "../../types/Story";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import Menu from "../common/Menu";
import RelativeTime from "../common/RelativeTime";
import DeleteStoryConfirm from "./DeleteStoryConfirm";
import StoryCanvas from "./StoryCanvas";
import StoryProgress from "./StoryProgress";
import StoryReply from "./StoryReply";
import StoryRingAvatar from "./StoryRingAvatar";
import { storyPosition } from "./storyText";
import {
  STORY_DURATION_MS,
  useAutoAdvance,
  usePageHidden,
  useReducedMotion,
} from "./useAutoAdvance";
import { useStoryAccounts } from "./useStoryAccounts";
import { parseViewerArgs, ViewerArgs } from "./viewerArgs";
import ViewersPanel from "./ViewersPanel";

/** Where to open an account: a story, its first unseen one, or its last (going back). */
type Target = { id: string } | "start" | "end";

/** A press on the tap zones longer than this pauses instead of moving on. */
const HOLD_MS = 300;

// The canvas is as wide as fits: at most 420px, short enough that the
// header, progress, reply field and dialog chrome fit in the viewport, and
// narrow enough to leave room for what sits beside it (--story-side: the
// Previous and Next buttons from 500px).
const STAGE_STYLE = {
  "--story-w":
    "min(420px, calc((100dvh - 15rem) * 9 / 16), calc(100vw - 2rem - var(--story-side, 0px)))",
} as CSSProperties;

function resolveIndex(
  stories: IStory[],
  target: Target,
  seenBefore: Record<string, true>
): number {
  if (stories.length === 0) return -1;
  if (target === "end") return stories.length - 1;
  if (target !== "start") {
    const index = stories.findIndex((story) => story.id === target.id);
    if (index >= 0) return index;
  }
  const unseen = stories.findIndex(
    (story) => !story.viewer.seen && !seenBefore[story.id]
  );
  return Math.max(unseen, 0);
}

/**
 * The full-screen story viewer (ui.dialog "storyViewer"). Focus goes back to
 * whatever opened it (the tray item) when it closes; the native <dialog>
 * does that in browsers, and this makes sure of it everywhere.
 */
export default function StoryViewerDialog({
  open,
  args,
  onClose,
}: {
  open: boolean;
  args: Record<string, string> | null;
  onClose: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const parsed = useMemo(() => parseViewerArgs(args), [args]);

  // Layout effects run before the Dialog's showModal() moves focus.
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
  }, [open]);

  useEffect(() => {
    if (open) return;
    const element = opener.current;
    opener.current = null;
    if (element?.isConnected && document.activeElement !== element)
      element.focus();
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Stories"
      hideTitle
      variant="fullscreen"
    >
      {parsed && (
        <StoryViewer
          key={JSON.stringify(args)}
          args={parsed}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function StoryViewer({
  args,
  onClose,
}: {
  args: ViewerArgs;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const messagesOn = useAppSelector((state) => state.session.features.messages);
  const seen = useAppSelector((state) => state.stories.seen);
  // Where an account starts is decided by what was unseen when the viewer
  // opened: the stories marked seen while watching mustn't move it.
  const [seenBefore] = useState(seen);
  const [openedAt] = useState(() => Date.now());
  const accounts = useStoryAccounts();
  const reducedMotion = useReducedMotion();
  const hidden = usePageHidden();

  const [cursor, setCursor] = useState<{ account: number; target: Target }>(
    () => ({
      account: args.start,
      target: args.story ? { id: args.story } : "start",
    })
  );
  const [restarts, setRestarts] = useState(0);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const [menuFocused, setMenuFocused] = useState(false);
  const [panel, setPanel] = useState<"viewers" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const pauseButton = useRef<HTMLButtonElement>(null);
  const seenByButton = useRef<HTMLButtonElement>(null);
  const menuArea = useRef<HTMLDivElement>(null);
  const pressStart = useRef<number | null>(null);

  const username = args.authors[cursor.account];
  const account = accounts.get(username);
  const stories = account.status === "ready" ? account.stories : null;
  const index = stories ? resolveIndex(stories, cursor.target, seenBefore) : -1;
  const story = stories && index >= 0 ? stories[index] : null;
  const isOwn =
    !!story &&
    !!viewer &&
    story.author.username.toLowerCase() === viewer.username.toLowerCase();

  const duration =
    story && !reducedMotion ? STORY_DURATION_MS[story.content.type] : null;
  const ready =
    !!story && (story.content.type === "text" || loadedImage === story.id);
  const paused =
    userPaused ||
    held ||
    hovered ||
    replyFocused ||
    menuFocused ||
    panel !== null ||
    hidden;
  const playKey = `${cursor.account}:${story?.id ?? ""}:${restarts}`;

  const goTo = (account: number, target: Target) => {
    setPanel(null);
    setDeleteError(null);
    setNotice("");
    if (account >= args.authors.length) onClose();
    else setCursor({ account, target });
  };

  // Until an account's stories arrive there is nowhere to move within it:
  // a quick → would skip the whole account, or close the viewer on the last.
  const loading = account.status === "loading";

  const next = () => {
    if (loading) return;
    if (stories && index >= 0 && index < stories.length - 1) {
      goTo(cursor.account, { id: stories[index + 1].id });
    } else {
      goTo(cursor.account + 1, "start");
    }
  };

  const previous = () => {
    if (loading) return;
    if (stories && index > 0)
      goTo(cursor.account, { id: stories[index - 1].id });
    else if (cursor.account > 0) goTo(cursor.account - 1, "end");
    else setRestarts((count) => count + 1);
  };

  useAutoAdvance({
    duration,
    running: ready && !paused,
    playKey,
    onDone: next,
  });

  // Load the account on screen and the next one, so moving on is instant.
  useEffect(() => {
    for (const name of args.authors.slice(cursor.account, cursor.account + 2))
      accounts.load(name);
  }, [accounts, args.authors, cursor.account]);

  const storyId = story?.id;
  const knownSeen = story?.viewer.seen ?? false;
  useEffect(() => {
    if (storyId) dispatch(storySeen(storyId, knownSeen));
  }, [dispatch, storyId, knownSeen]);

  // Watched stories go to the server in batches: every few seconds, and
  // once more when the viewer closes (unmounts).
  useEffect(() => {
    const timer = setInterval(() => dispatch(flushSeen()), SEEN_FLUSH_MS);
    return () => {
      clearInterval(timer);
      dispatch(flushSeen());
    };
  }, [dispatch]);

  // ←/→ move, Space pauses, Esc closes (the <dialog> itself) or, with the
  // viewers list or the delete prompt open, closes just that. Keys typed in
  // the reply field or used inside the "…" menu stay theirs.
  const closePanel = () => {
    const was = panel;
    setPanel(null);
    setDeleteError(null);
    if (was === "viewers") seenByButton.current?.focus();
    else menuArea.current?.querySelector<HTMLElement>("button")?.focus();
  };
  const keys = useRef({ next, previous, panel, closePanel });
  useEffect(() => {
    keys.current = { next, previous, panel, closePanel };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      const handlers = keys.current;
      if (event.key === "Escape" && handlers.panel) {
        event.preventDefault();
        handlers.closePanel();
        return;
      }
      if (
        handlers.panel ||
        target?.closest(
          "input, textarea, select, [contenteditable], [role='menu']"
        )
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handlers.next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlers.previous();
      } else if (event.key === " " && !target?.closest("button, a")) {
        // On a button, Space presses it (Pause itself, or Next).
        event.preventDefault();
        setUserPaused((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const deleteStory = async () => {
    if (!story || !stories) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await storiesApi.remove(story.id);
    } catch (reason) {
      setDeleteError(errorMessage(reason));
      setDeleting(false);
      return;
    }
    setDeleting(false);
    dispatch(trayChanged());
    dispatch(showToast({ message: "Your story was deleted" }));
    const remaining = stories.filter((item) => item.id !== story.id);
    accounts.removeStory(username, story.id);
    // The prompt (and its focused button) goes away: keep focus in the viewer.
    pauseButton.current?.focus();
    if (remaining.length === 0) {
      goTo(cursor.account + 1, "start");
      return;
    }
    goTo(cursor.account, {
      id: remaining[Math.min(index, remaining.length - 1)].id,
    });
    setNotice("Story deleted.");
  };

  // Touch: tapping the left third goes back, the rest moves on; holding
  // pauses until the finger lifts. Mouse: hovering the story pauses it.
  const tapZone = (action: () => void) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") return;
      pressStart.current = Date.now();
      setHeld(true);
    },
    onPointerUp: () => setHeld(false),
    onPointerCancel: () => setHeld(false),
    onPointerLeave: () => setHeld(false),
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    onClick: () => {
      const started = pressStart.current;
      pressStart.current = null;
      if (started !== null && Date.now() - started >= HOLD_MS) return;
      action();
    },
  });

  let announcement = "";
  if (story && stories) {
    const position = storyPosition(
      index,
      stories.length,
      story.author.fullname,
      story.createdAt,
      openedAt
    );
    announcement = notice ? `${notice} ${position}` : position;
  } else if (account.status === "ready") {
    announcement = "This story is no longer available";
  }

  const author = story?.author;

  return (
    <div
      style={STAGE_STYLE}
      // Two 40px buttons and two 12px gaps.
      className="mx-auto flex w-fit max-w-full flex-col items-center gap-3 xs:[--story-side:6.5rem]"
    >
      <div className="flex w-[var(--story-w)] flex-col gap-3">
        <StoryProgress
          count={stories?.length || 1}
          current={Math.max(index, 0)}
          duration={story ? duration : null}
          running={ready && !paused}
          playKey={playKey}
        />
        <div className="flex min-h-10 items-center gap-2">
          {author ? (
            <Link
              href={`/${author.username}`}
              onClick={onClose}
              className="flex min-w-0 items-center gap-2 hover:underline"
            >
              <StoryRingAvatar user={author} size={32} ring="none" />
              <span className="truncate font-bold">{author.fullname}</span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {story && (
            <span className="shrink-0 text-[15px] text-muted">
              · <RelativeTime iso={story.createdAt} />
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              ref={pauseButton}
              type="button"
              data-autofocus
              aria-label={userPaused ? "Play" : "Pause"}
              onClick={() => setUserPaused((value) => !value)}
              className="rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
            >
              {userPaused ? (
                <HiPlay aria-hidden="true" />
              ) : (
                <HiPause aria-hidden="true" />
              )}
            </button>
            {isOwn && !readOnly && (
              <div
                ref={menuArea}
                onFocus={() => setMenuFocused(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setMenuFocused(false);
                }}
              >
                <Menu
                  label="Story options"
                  trigger={<HiEllipsisHorizontal aria-hidden="true" />}
                  triggerClassName="rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
                  items={[
                    {
                      label: "Delete",
                      icon: <HiOutlineTrash />,
                      danger: true,
                      onSelect: () => setPanel("delete"),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-3">
        <button
          type="button"
          aria-label="Previous story"
          {...tapZone(previous)}
          className="z-10 select-none [-webkit-touch-callout:none] max-xs:absolute max-xs:inset-y-0 max-xs:left-0 max-xs:w-1/3 max-xs:outline-offset-[-4px] xs:rounded-full xs:bg-fg/10 xs:p-2 xs:text-2xl xs:transition-colors xs:hover:bg-fg/20"
        >
          <HiChevronLeft aria-hidden="true" className="max-xs:hidden" />
        </button>

        <div
          className="relative w-[var(--story-w)]"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
        >
          {story ? (
            <StoryCanvas
              key={story.id}
              content={story.content}
              onReady={() => setLoadedImage(story.id)}
            />
          ) : (
            <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-xl bg-subtle p-6 text-center">
              {account.status === "loading" && (
                <span
                  aria-hidden="true"
                  className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary"
                />
              )}
              {account.status === "error" && (
                <>
                  <p role="alert" className="text-[15px] text-danger">
                    {account.message}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => accounts.retry(username)}
                  >
                    Retry
                  </Button>
                </>
              )}
              {account.status === "ready" && (
                <p className="text-[15px] font-bold">
                  This story is no longer available
                </p>
              )}
            </div>
          )}

          {panel === "delete" && story && (
            <DeleteStoryConfirm
              busy={deleting}
              error={deleteError}
              onConfirm={deleteStory}
              onCancel={closePanel}
            />
          )}
          {panel === "viewers" && story && (
            <ViewersPanel storyId={story.id} onClose={closePanel} />
          )}
        </div>

        <button
          type="button"
          aria-label="Next story"
          {...tapZone(next)}
          className="z-10 select-none [-webkit-touch-callout:none] max-xs:absolute max-xs:inset-y-0 max-xs:right-0 max-xs:w-2/3 max-xs:outline-offset-[-4px] xs:rounded-full xs:bg-fg/10 xs:p-2 xs:text-2xl xs:transition-colors xs:hover:bg-fg/20"
        >
          <HiChevronRight aria-hidden="true" className="max-xs:hidden" />
        </button>
      </div>

      <div className="w-[var(--story-w)]">
        {story && isOwn && story.views !== null && (
          <button
            ref={seenByButton}
            type="button"
            onClick={() => setPanel("viewers")}
            className="min-h-11 rounded-full px-3 text-[15px] font-bold transition-colors hover:bg-fg/10"
          >
            Seen by {story.views}
          </button>
        )}
        {story && !isOwn && messagesOn && !readOnly && (
          <StoryReply
            key={story.author.username}
            story={story}
            onFocusChange={setReplyFocused}
            onNavigate={onClose}
          />
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
