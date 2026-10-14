import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";

/**
 * "Add credits" from a review: opens the Add credits dialog and, once it
 * closes, focuses `target()` if focus was lost. The <dialog> returns focus
 * to what was focused when it opened, which is gone by then: the Tip sheet
 * closes as Add credits opens, and the pay sheet's short-balance alert
 * (with its Add credits button) goes once the balance is enough.
 */
export function useAddCredits(target: () => HTMLElement | null | undefined) {
  const dispatch = useAppDispatch();
  const dialog = useAppSelector((state) => state.ui.dialog);
  const opened = useRef(false);
  const latest = useRef(target);
  useLayoutEffect(() => {
    latest.current = target;
  });

  useEffect(() => {
    if (!opened.current || dialog === "topUp") return;
    opened.current = false;
    // Another dialog took over: it has its own focus to manage.
    if (dialog !== null) return;
    // Wait for this commit's other effects: Add credits' <dialog> may close,
    // moving focus, after this effect has run.
    const timer = setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      latest.current()?.focus();
    });
    return () => clearTimeout(timer);
  }, [dialog]);

  return useCallback(() => {
    opened.current = true;
    dispatch(openDialog("topUp"));
  }, [dispatch]);
}
