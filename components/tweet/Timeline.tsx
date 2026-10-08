import { ReactNode, useEffect, useRef } from "react";

import { loadMoreTimeline } from "../../slices/timelinesSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Button } from "../common/Button";
import Spinner from "../common/Spinner";
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
  const hasMore = !!timeline?.nextCursor;
  const failed = timeline?.status === "failed";

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

      <div ref={sentinel}>
        {timeline.status === "loading" && (
          <Spinner label="Loading more Tweets" />
        )}
        {failed && (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 p-6 text-[15px] text-muted"
          >
            <p>{timeline.error}</p>
            <Button onClick={() => dispatch(loadMoreTimeline(timelineKey))}>
              Retry
            </Button>
          </div>
        )}
        {hasMore && timeline.status === "idle" && (
          <button
            type="button"
            onClick={() => dispatch(loadMoreTimeline(timelineKey))}
            className="w-full p-4 text-[15px] text-primary transition-colors hover:bg-fg/[0.03]"
          >
            Show more Tweets
          </button>
        )}
      </div>
    </section>
  );
}
