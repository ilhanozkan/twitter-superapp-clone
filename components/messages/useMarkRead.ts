import { useEffect, useRef } from "react";

import { markThreadRead } from "../../slices/messagesSlice";
import { useAppDispatch } from "../../store";
import { IConversation } from "../../types/Message";
import { usePageVisible } from "./usePageVisible";

/** At most one read marker write per this long (§4.5). */
export const READ_EVERY_MS = 5_000;

/**
 * Marks the open conversation read while it is visible and has unread
 * messages, at most once every 5 s. Each poll brings a fresh conversation
 * (new unread messages, or a mark that failed and is still due), which
 * schedules the next try. Off in READ_ONLY, where the server refuses writes.
 */
export function useMarkRead(
  conversation: IConversation | null,
  enabled: boolean
) {
  const dispatch = useAppDispatch();
  const visible = usePageVisible();
  const lastAt = useRef(-Infinity);

  useEffect(() => {
    if (!enabled || !visible || !conversation || conversation.unread === 0)
      return;
    const wait = Math.max(0, lastAt.current + READ_EVERY_MS - Date.now());
    const timer = setTimeout(() => {
      lastAt.current = Date.now();
      // A failure stays unread; the next poll schedules another try.
      dispatch(markThreadRead(conversation.id)).catch(() => {});
    }, wait);
    return () => clearTimeout(timer);
  }, [dispatch, enabled, visible, conversation]);
}
