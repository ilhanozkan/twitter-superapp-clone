import { useEffect, useRef } from "react";

interface StoryProgressProps {
  count: number;
  /** Index of the story on screen. */
  current: number;
  /** How long it plays; null when it doesn't advance by itself (reduced motion). */
  duration: number | null;
  running: boolean;
  /** Changes when the current story starts over (a new story, or Previous on the first). */
  playKey: string;
}

/**
 * The segmented bars over a story: watched ones full, the current one
 * filling while it plays. Purely visual (aria-hidden): the viewer announces
 * "Story 2 of 3" in text. The bar is animated by the browser (Web Animations)
 * and paused with the viewer's timer, so nothing re-renders while it fills.
 * Without auto-advance (reduced motion) the segments fill in steps.
 */
export default function StoryProgress({
  count,
  current,
  duration,
  running,
  playKey,
}: StoryProgressProps) {
  const bar = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | null>(null);

  useEffect(() => {
    const element = bar.current;
    if (!element || duration === null || typeof element.animate !== "function")
      return;
    const fill = element.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration, easing: "linear", fill: "forwards" }
    );
    fill.pause();
    animation.current = fill;
    return () => {
      fill.cancel();
      animation.current = null;
    };
  }, [playKey, duration]);

  useEffect(() => {
    const fill = animation.current;
    if (!fill) return;
    if (running) fill.play();
    else fill.pause();
  }, [running, playKey, duration]);

  return (
    <div aria-hidden="true" className="flex gap-1">
      {Array.from({ length: count }, (_, index) => {
        const full =
          index < current || (index === current && duration === null);
        return (
          <span
            key={index}
            className="h-1 flex-1 overflow-hidden rounded-full bg-fg/20"
          >
            <span
              ref={index === current ? bar : undefined}
              data-state={
                index < current
                  ? "done"
                  : index === current
                    ? "current"
                    : "next"
              }
              className="block h-full origin-left bg-fg"
              style={{ transform: `scaleX(${full ? 1 : 0})` }}
            />
          </span>
        );
      })}
    </div>
  );
}
