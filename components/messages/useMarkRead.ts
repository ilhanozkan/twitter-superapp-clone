import { useEffect, useRef } from "react";

import { markThreadRead } from "../../slices/messagesSlice";
import { AppDispatch, RootState, useAppDispatch } from "../../store";
import { usePageVisible } from "./usePageVisible";

/** At most one read marker write per this long (§4.5). */
export const READ_EVERY_MS = 5_000;

/** What can be marked read: a conversation, or a channel (by handle). */
export interface Readable {
  id: string;
  unread: number;
}

type MarkRead = (
  id: string
) => (dispatch: AppDispatch, getState: () => RootState) => Promise<void>;

/**
 * Marks the open conversation read while it is visible and has unread
 * messages, at most once every 5 s. Each poll brings a fresh conversation
 * (new unread messages, or a mark that failed and is still due), which
 * schedules the next try. Off in READ_ONLY, where the server refuses writes.
 * Channels pass their own `mark`.
 */
export function useMarkRead(
  target: Readable | null,
  enabled: boolean,
  mark: MarkRead = markThreadRead
) {
  const dispatch = useAppDispatch();
  const visible = usePageVisible();
  const lastAt = useRef(-Infinity);

  useEffect(() => {
    if (!enabled || !visible || !target || target.unread === 0) return;
    const wait = Math.max(0, lastAt.current + READ_EVERY_MS - Date.now());
    const timer = setTimeout(() => {
      lastAt.current = Date.now();
      // A failure stays unread; the next poll schedules another try.
      dispatch(mark(target.id)).catch(() => {});
    }, wait);
    return () => clearTimeout(timer);
  }, [dispatch, enabled, visible, target, mark]);
}
