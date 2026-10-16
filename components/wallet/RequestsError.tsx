import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { fetchRequests } from "../../slices/walletUiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Button } from "../common/Button";

/**
 * For the list a RequestsError stands in for: once its Retry has brought
 * the requests back, the alert (and the Retry that had focus) is gone, so
 * focus moves to `target()`, unless the reader has moved on meanwhile.
 * Returns the RequestsError's `onRetry`.
 */
export function useFocusAfterRetry(
  target: () => HTMLElement | null | undefined
) {
  const status = useAppSelector((state) => state.walletUi.requests.status);
  const pressed = useRef(false);
  const latest = useRef(target);
  useLayoutEffect(() => {
    latest.current = target;
  });

  useEffect(() => {
    if (status !== "loaded" || !pressed.current) return;
    pressed.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    latest.current()?.focus();
  }, [status]);

  return useCallback(() => {
    pressed.current = true;
  }, []);
}

/**
 * Requests couldn't be read: say so where they would be, with Retry. The
 * alert stays while the retry runs (Retry busy), so focus stays on it, and
 * again if that fails too.
 */
export default function RequestsError({ onRetry }: { onRetry: () => void }) {
  const dispatch = useAppDispatch();
  const retrying = useAppSelector(
    (state) => state.walletUi.requests.status === "retrying"
  );

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-4 text-[15px]"
    >
      <p className="min-w-0 flex-1">
        Payment requests can’t be loaded right now.
      </p>
      <Button
        variant="outline"
        aria-disabled={retrying}
        aria-busy={retrying}
        onClick={() => {
          if (retrying) return;
          onRetry();
          void dispatch(fetchRequests());
        }}
        className="gap-2 aria-disabled:cursor-progress"
      >
        {retrying && (
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
          />
        )}
        Retry
      </Button>
    </div>
  );
}
