import { useEffect, useRef, useSyncExternalStore } from "react";

import { StoryContent } from "../../types/Story";

/** How long a story plays before the next one: text 5 s, photos 6 s. */
export const STORY_DURATION_MS: Record<StoryContent["type"], number> = {
  text: 5_000,
  image: 6_000,
};

/**
 * Calls `onDone` once the current story has played for `duration` ms while
 * `running`. Pausing keeps the time already played, so the story resumes
 * where it stopped; a new `playKey` (the next story, or a restart) starts
 * from zero. A null `duration` never advances (reduced motion).
 */
export function useAutoAdvance({
  duration,
  running,
  playKey,
  onDone,
}: {
  duration: number | null;
  running: boolean;
  playKey: string;
  onDone: () => void;
}) {
  const played = useRef({ key: playKey, ms: 0 });
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (played.current.key !== playKey)
      played.current = { key: playKey, ms: 0 };
    if (!running || duration === null) return;

    const startedAt = Date.now();
    const timer = setTimeout(
      () => done.current(),
      Math.max(0, duration - played.current.ms)
    );
    return () => {
      clearTimeout(timer);
      if (played.current.key === playKey) {
        played.current.ms += Date.now() - startedAt;
      }
    };
  }, [running, duration, playKey]);
}

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia?.(query);
    media?.addEventListener("change", onChange);
    return () => media?.removeEventListener("change", onChange);
  };
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = subscribeMedia(REDUCED_MOTION);

/** The reader asked for less motion: stories then never advance by themselves. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false
  );
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** The tab is in the background: a story shouldn't play to nobody. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "hidden",
    () => false
  );
}
