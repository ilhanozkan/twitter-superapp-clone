import { useRouter } from "next/router";
import { useEffect } from "react";

import { readShortcutsEnabled } from "../../lib/client/shortcuts";
import { openCompose, openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
  );
}

function focusSearch() {
  document
    .querySelector<HTMLInputElement>('main input[type="search"]')
    ?.focus();
}

/**
 * "n" new Tweet, "/" search, "?" shortcuts help. Ignored while typing, in a
 * dialog or menu, on key repeat, and when turned off in the shortcuts dialog.
 */
export default function useGlobalShortcuts() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const readOnly = useAppSelector((state) => state.session.readOnly);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        isTyping(event.target) ||
        document.querySelector('dialog[open], [role="menu"]') ||
        !readShortcutsEnabled()
      )
        return;

      if (event.key === "n" && !readOnly) {
        event.preventDefault();
        dispatch(openCompose());
      } else if (event.key === "/") {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"]'
        );
        if (search && search.offsetParent !== null) search.focus();
        // Below 1024px the search box lives on the Explore page.
        else router.push("/explore").then(focusSearch);
      } else if (event.key === "?") {
        event.preventDefault();
        dispatch(openDialog("shortcuts"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, router, readOnly]);
}
