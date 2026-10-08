import { ReactNode, useEffect, useRef } from "react";

import { loadMoreTimeline } from "../../slices/timelinesSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Button } from "../common/Button";
import TweetCard from "./TweetCard";

interface TimelineProps {
  timelineKey: string;
  /** Shown when the timeline has no tweets. */
  empty: ReactNode;
  label: string;
}

/**
 * Tweets of one timeline from the store. More pages load when the end of the
 * list scrolls into view, with a button as a fallback (and for keyboard users).
 */
export default function Timeline({ timelineKey, empty, label }: TimelineProps) {
  const dispatch = useAppDispatch();
  const timeline = useAppSelector((state) => state.timelines[timelineKey]);
  const entities = useAppSelector((state) => state.tweets.entities);
  const sentinel = useRef<HTMLDivElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  // How many tweets were shown when the user asked for more with a button.
  const requestedAt = useRef<number | null>(null);
  const hasMore = !!timeline?.nextCursor;
  const loading = timeline?.status === "loading";
  const failed = timeline?.status === "failed";

  const loadMore = () => {
    if (loading || !timeline) return;
    requestedAt.current = timeline.ids.length;
    dispatch(loadMoreTimeline(timelineKey));
  };

  // After a button-triggered load, move focus to the first new tweet, so the
  // next Tab continues with it instead of skipping everything that loaded.
  useEffect(() => {
    if (requestedAt.current === null || loading || !timeline) return;
    const firstNew = timeline.ids[requestedAt.current];
    requestedAt.current = null;
    if (firstNew) document.getElementById(`tweet-${firstNew}-author`)?.focus();
    else if (failed) retry.current?.focus();
  }, [timeline, loading, failed]);

  useEffect(() => {
    const element = sentinel.current;
    if (
      !element ||
      !hasMore ||
      failed ||
      typeof IntersectionObserver === "undefined"
    )
      return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) dispatch(loadMoreTimeline(timelineKey));
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [dispatch, timelineKey, hasMore, failed]);

  if (!timeline) return null;

  const tweets = timeline.ids.map((id) => entities[id]).filter(Boolean);
  if (tweets.length === 0 && !hasMore) return <>{empty}</>;

  return (
    <section aria-label={label}>
      {tweets.map((tweet) => (
        <TweetCard key={tweet!.id} tweet={tweet!} />
      ))}

      <div ref={sentinel} aria-busy={loading}>
        {failed ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 p-6 text-[15px] text-muted"
          >
            <p>{timeline.error}</p>
            <Button ref={retry} onClick={loadMore}>
              Retry
            </Button>
          </div>
        ) : (
          (hasMore || loading) && (
            // Stays mounted while loading (aria-disabled, not disabled), so
            // a keyboard user's focus is not dropped to the page.
            <button
              type="button"
              aria-disabled={loading}
              onClick={loadMore}
              className="flex w-full justify-center p-4 text-[15px] text-primary transition-colors hover:bg-fg/[0.03] aria-disabled:cursor-progress"
            >
              {loading ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary"
                  />
                  <span className="sr-only">Loading more Tweets</span>
                </>
              ) : (
                "Show more Tweets"
              )}
            </button>
          )
        )}
      </div>
    </section>
  );
}
