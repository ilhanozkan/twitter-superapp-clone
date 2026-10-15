// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import Dialog from "./Dialog";

// jsdom has <dialog> but not its modal API: open and close it by attribute.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal === "function") return;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  cleanup();
});

describe("Dialog", () => {
  it("closes on Escape without waiting for the browser's close event", () => {
    // On Escape the browser fires "cancel" and hides the dialog, but fires
    // "close" only at its next frame. Focus must not stay on the hidden
    // content until then: a key typed in between would go into it.
    function Compose() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onClose={() => setOpen(false)} title="Compose">
          <textarea aria-label="Tweet text" data-autofocus />
        </Dialog>
      );
    }
    render(<Compose />);
    const dialog = screen.getByRole<HTMLDialogElement>("dialog", {
      name: "Compose",
    });
    expect(document.activeElement).toBe(screen.getByLabelText("Tweet text"));

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(dialog.open).toBe(false);
    expect(screen.queryByLabelText("Tweet text")).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(false);
  });
});
