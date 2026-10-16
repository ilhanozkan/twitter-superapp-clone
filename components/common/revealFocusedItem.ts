import { FocusEvent } from "react";

/**
 * `onFocus` for a list that scrolls sideways (the story tray, the business
 * carousel): scrolls the item that took keyboard focus fully into view.
 * Chrome leaves an item that is already partly in view where it is, so Tab
 * could land on a card that is mostly outside the list (WCAG 2.4.11). Focus
 * from a pointer is left alone, so a tap never moves the card it is on.
 */
export function revealFocusedItem(event: FocusEvent<HTMLElement>) {
  const target = event.target;
  if (!keyboardFocused(target)) return;
  const item = target.closest("li") ?? target;
  // Optional: jsdom has no scrollIntoView.
  item.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function keyboardFocused(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    // A browser that doesn't know :focus-visible: reveal anyway.
    return true;
  }
}
