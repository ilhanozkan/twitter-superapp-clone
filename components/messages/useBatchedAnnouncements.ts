import { useCallback, useEffect, useRef, useState } from "react";

import { announcementText } from "./messageText";

/** At most one chat announcement per this long (§17). */
export const ANNOUNCE_EVERY_MS = 5_000;

/**
 * Incoming messages and request status changes, read out politely in
 * batches: the first is announced at once, and whatever comes within the
 * next 5 s waits for one combined line ("2 new messages from Sarah Chen.
 * Sarah Chen cancelled their 4.50 credits request"), so a busy chat never
 * floods a screen reader. `text` goes in a polite live region.
 */
export function useBatchedAnnouncements(interval = ANNOUNCE_EVERY_MS) {
  const [text, setText] = useState("");
  const pending = useRef<{ authors: string[]; changes: string[] }>({
    authors: [],
    changes: [],
  });
  const lastAt = useRef(-Infinity);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Alternates a trailing no-break space, so the same words twice in a row
  // are still a change that gets announced.
  const flip = useRef(false);

  const flush = useCallback(() => {
    timer.current = null;
    const { authors, changes } = pending.current;
    pending.current = { authors: [], changes: [] };
    if (authors.length === 0 && changes.length === 0) return;
    lastAt.current = Date.now();
    flip.current = !flip.current;
    const lines = authors.length
      ? [announcementText(authors), ...changes]
      : changes;
    setText(`${lines.join(". ")}${flip.current ? "" : " "}`);
  }, []);

  /**
   * Queues one announcement per message, by its author's name, and the
   * given status changes, each a sentence of its own.
   */
  const announce = useCallback(
    (authors: string[], changes: string[] = []) => {
      if (authors.length === 0 && changes.length === 0) return;
      pending.current.authors.push(...authors);
      pending.current.changes.push(...changes);
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
