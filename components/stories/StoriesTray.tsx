import { useCallback, useEffect, useRef, useState } from "react";
import { HiChevronLeft, HiChevronRight, HiPlus } from "react-icons/hi2";

import { storiesApi } from "../../lib/client/storiesApi";
import { restoreSeen } from "../../slices/storiesSlice";
import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IStoryTrayItem } from "../../types/Story";
import { IAuthor } from "../../types/User";
import StoryRingAvatar from "./StoryRingAvatar";
import { unseenIds, viewerArgs } from "./viewerArgs";

const AVATAR = 64;
const ITEM =
  "flex w-[76px] flex-col items-center gap-1 rounded-xl p-1 text-[13px] leading-4 transition-colors hover:bg-fg/5";
// The "+" on "Your story", over the avatar's lower right edge.
const PLUS =
  "left-[54px] top-[50px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-primary-fill text-sm text-white";

const isViewer = (item: IStoryTrayItem, viewer: IAuthor | null) =>
  !!viewer &&
  item.author.username.toLowerCase() === viewer.username.toLowerCase();

/**
 * The tray reloads itself after the viewer posts or deletes a story; a new
 * page load (Home again) brings fresh server items, which win.
 */
function useTrayItems(items: IStoryTrayItem[]): IStoryTrayItem[] {
  const version = useAppSelector((state) => state.stories.trayVersion);
  const loadedFor = useRef(version);
  const [reloaded, setReloaded] = useState<{
    basis: IStoryTrayItem[];
    items: IStoryTrayItem[];
  } | null>(null);

  useEffect(() => {
    if (loadedFor.current === version) return;
    loadedFor.current = version;
    let current = true;
    storiesApi.tray().then(
      (body) => {
        if (current) setReloaded({ basis: items, items: body.items });
      },
      () => {
        // Keep the tray as it is; the next visit to Home brings it fresh.
      }
    );
    return () => {
      current = false;
    };
  }, [version, items]);

  return reloaded?.basis === items ? reloaded.items : items;
}

/** Arrow buttons from 500px, shown only while there is more that way. */
function useScrollEdges() {
  const list = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const element = list.current;
    if (!element) return;
    const start = element.scrollLeft > 1;
    const end =
      element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setEdges((previous) =>
      previous.start === start && previous.end === end
        ? previous
        : { start, end }
    );
  }, []);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [update]);

  const scroll = (direction: 1 | -1) => {
    const element = list.current;
    if (!element) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return { list, edges, update, scroll };
}

/**
 * The story tray on Home (§4.10): "Your story" first, then accounts with
 * stories you haven't seen, then the rest, as a native horizontal list that
 * scrolls inside itself (with snap). Every item is a named button, e.g.
 * "Mert Demir's stories, 2 new"; the ring turns grey as soon as you've
 * watched everything. Items keep their place until the next load, so focus
 * can return to the one that opened the viewer.
 */
export default function StoriesTray({ items }: { items: IStoryTrayItem[] }) {
  const dispatch = useAppDispatch();
  const on = useAppSelector((state) => state.session.features.stories);
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const seen = useAppSelector((state) => state.stories.seen);
  const shown = useTrayItems(items);
  const { list, edges, update, scroll } = useScrollEdges();

  // READ_ONLY: stories watched in this tab before a reload stay grey.
  useEffect(() => {
    dispatch(restoreSeen());
  }, [dispatch]);

  if (!on || !viewer) return null;

  const own = shown.find((item) => isViewer(item, viewer)) ?? null;
  const others = shown.filter((item) => !isViewer(item, viewer));
  // Nothing to watch and nothing to post: no tray at all.
  if (readOnly && !own && others.length === 0) return null;

  const watch = (item: IStoryTrayItem, sequence: IStoryTrayItem[]) => {
    const unseen = unseenIds(item, seen);
    dispatch(
      openDialog(
        "storyViewer",
        viewerArgs(
          sequence.map((entry) => entry.author.username),
          { from: item.author.username, story: unseen[0] }
        )
      )
    );
  };
  const compose = () => dispatch(openDialog("storyComposer"));

  return (
    <section aria-label="Stories" className="relative border-b border-line">
      <ul
        ref={list}
        onScroll={update}
        className="flex snap-x snap-mandatory scroll-px-3 gap-1 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {own && (
          <li className="relative shrink-0 snap-start">
            <button
              type="button"
              data-story-author={own.author.username}
              onClick={() => watch(own, [own])}
              className={ITEM}
            >
              <StoryRingAvatar
                user={viewer}
                size={AVATAR}
                ring={unseenIds(own, seen).length > 0 ? "unseen" : "seen"}
              />
              <span className="max-w-full truncate">Your story</span>
            </button>
            {!readOnly && (
              <button
                type="button"
                aria-label="Add to your story"
                onClick={compose}
                className={`absolute ${PLUS} hover:bg-primary-fill-hover`}
              >
                <HiPlus aria-hidden="true" />
              </button>
            )}
          </li>
        )}
        {!own && !readOnly && (
          <li className="relative shrink-0 snap-start">
            <button
              type="button"
              aria-label="Add to your story"
              onClick={compose}
              className={ITEM}
            >
              <StoryRingAvatar user={viewer} size={AVATAR} ring="none" />
              <span aria-hidden="true" className={`absolute ${PLUS}`}>
                <HiPlus />
              </span>
              <span className="max-w-full truncate">Your story</span>
            </button>
          </li>
        )}
        {others.map((item) => {
          const unseen = unseenIds(item, seen).length;
          const name = `${item.author.fullname}'s stories${unseen ? `, ${unseen} new` : ""}`;
          return (
            <li key={item.author.username} className="shrink-0 snap-start">
              <button
                type="button"
                aria-label={name}
                data-story-author={item.author.username}
                onClick={() => watch(item, others)}
                className={ITEM}
              >
                <StoryRingAvatar
                  user={item.author}
                  size={AVATAR}
                  ring={unseen ? "unseen" : "seen"}
                />
                <span className="max-w-full truncate">
                  {item.author.fullname}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* An enhancement for mouse users: every item is reachable with Tab. */}
      {edges.start && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => scroll(-1)}
          className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-surface p-1.5 text-xl shadow-menu hover:bg-subtle xs:block"
        >
          <HiChevronLeft />
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => scroll(1)}
          className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-surface p-1.5 text-xl shadow-menu hover:bg-subtle xs:block"
        >
          <HiChevronRight />
        </button>
      )}
    </section>
  );
}
