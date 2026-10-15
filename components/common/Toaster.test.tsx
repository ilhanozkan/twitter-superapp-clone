// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { showToast } from "../../slices/uiSlice";
import { makeStore } from "../../store";
import Toaster from "./Toaster";

function renderToaster() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <main id="main" tabIndex={-1} />
      <Toaster />
    </Provider>
  );
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("dismisses plain toasts after 4 seconds", () => {
    const store = renderToaster();
    act(() => {
      store.dispatch(showToast({ message: "Copied to clipboard" }));
    });
    expect(screen.getByText("Copied to clipboard")).toBeTruthy();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("Copied to clipboard")).toBeNull();
  });

  it("keeps a toast while it is hovered or focused, and longer with an action", () => {
    const store = renderToaster();
    act(() => {
      store.dispatch(
        showToast({
          message: "Your Tweet was sent.",
          action: { label: "View", href: "/x/status/1" },
        })
      );
    });
    const toast = screen.getByText("Your Tweet was sent.").parentElement!;

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("Your Tweet was sent.")).not.toBeNull();

    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText("Your Tweet was sent.")).not.toBeNull();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText("Your Tweet was sent.")).toBeNull();
  });

  it("returns focus to the page when a focused toast is dismissed", () => {
    const store = renderToaster();
    act(() => {
      store.dispatch(showToast({ message: "Removed from your Bookmarks" }));
    });
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    dismiss.focus();
    fireEvent.click(dismiss);

    expect(screen.queryByText("Removed from your Bookmarks")).toBeNull();
    expect(document.activeElement?.id).toBe("main");
  });
});
