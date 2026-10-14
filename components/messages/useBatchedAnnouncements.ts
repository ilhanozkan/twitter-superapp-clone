import { useCallback, useEffect, useRef, useState } from "react";

import { announcementText } from "./messageText";

/** At most one chat announcement per this long (§17). */
export const ANNOUNCE_EVERY_MS = 5_000;

/**
 * Incoming messages, read out politely in batches: the first arrival is
 * announced at once, and whatever arrives within the next 5 s waits for
 * one combined line ("2 new messages from Sarah Chen"), so a busy chat
 * never floods a screen reader. `text` goes in a polite live region.
 */
export function useBatchedAnnouncements(interval = ANNOUNCE_EVERY_MS) {
  const [text, setText] = useState("");
  const pending = useRef<string[]>([]);
  const lastAt = useRef(-Infinity);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Alternates a trailing no-break space, so the same words twice in a row
  // are still a change that gets announced.
  const flip = useRef(false);

  const flush = useCallback(() => {
    timer.current = null;
    const authors = pending.current;
    pending.current = [];
    if (authors.length === 0) return;
    lastAt.current = Date.now();
    flip.current = !flip.current;
    setText(`${announcementText(authors)}${flip.current ? "" : " "}`);
  }, []);

  /** Queues one announcement per message, by its author's name. */
  const announce = useCallback(
    (authors: string[]) => {
      if (authors.length === 0) return;
      pending.current.push(...authors);
      if (timer.current) return;
      const wait = Math.max(0, lastAt.current + interval - Date.now());
      timer.current = setTimeout(flush, wait);
    },
    [flush, interval]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { text, announce };
}
