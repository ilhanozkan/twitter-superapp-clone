// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithStore } from "../../test/render";
import Dialog, { DialogVariant } from "./Dialog";

afterEach(() => {
  cleanup();
});

function renderDialog(variant?: DialogVariant, onClose = vi.fn()) {
  renderWithStore(
    <Dialog open onClose={onClose} title="Send credits" variant={variant}>
      <button type="button" data-autofocus>
        Next
      </button>
    </Dialog>
  );
  return {
    dialog: screen.getByRole("dialog", { name: "Send credits" }),
    onClose,
  };
}

describe("Dialog", () => {
  it("is a centred modal by default, focusing the marked field", () => {
    const { dialog } = renderDialog();
    expect(dialog.getAttribute("data-variant")).toBe("center");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.className).toContain("w-[min(600px,calc(100vw-2rem))]");
    expect(dialog.className).not.toContain("max-xs:");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Next" })
    );
  });

  it("is a bottom sheet on phones and centred above 500px", () => {
    const { dialog } = renderDialog("sheet");
    expect(dialog.getAttribute("data-variant")).toBe("sheet");
    for (const phone of [
      "max-xs:mb-0",
      "max-xs:w-full",
      "max-xs:rounded-b-none",
    ]) {
      expect(dialog.className).toContain(phone);
    }
    expect(dialog.className).toContain("w-[min(600px,calc(100vw-2rem))]");
  });

  it("can cover the whole viewport", () => {
    const { dialog } = renderDialog("fullscreen");
    expect(dialog.getAttribute("data-variant")).toBe("fullscreen");
    for (const name of ["h-full", "w-full", "max-w-none", "rounded-none"]) {
      expect(dialog.className).toContain(name);
    }
  });

  it("closes from its Close button in every variant", async () => {
    for (const variant of ["center", "sheet", "fullscreen"] as const) {
      const { onClose } = renderDialog(variant);
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

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
    renderWithStore(<Compose />);
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
