// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChatComposer from "./ChatComposer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Pretends the device has a touch screen (pointer: coarse) or not. */
function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: coarse && query === "(pointer: coarse)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function renderComposer(onMoney?: (mode: "send" | "request") => void) {
  const onSend = vi.fn();
  render(
    <ChatComposer recipient="Sarah Chen" onSend={onSend} onMoney={onMoney} />
  );
  const field = screen.getByLabelText("Message Sarah Chen");
  return { onSend, field: field as HTMLTextAreaElement };
}

describe("ChatComposer", () => {
  it("sends on Enter and clears the box, keeping focus there", async () => {
    const user = userEvent.setup();
    const { onSend, field } = renderComposer();

    await user.type(field, "  Friday coffee?  {Enter}");
    expect(onSend).toHaveBeenCalledWith("Friday coffee?");
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
  });

  it("adds a line on Shift+Enter instead of sending", async () => {
    const user = userEvent.setup();
    const { onSend, field } = renderComposer();

    await user.type(field, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(field.value).toBe("Line one\nLine two");

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("Line one\nLine two");
  });

  it("says how Enter works through the field's description", () => {
    const { field } = renderComposer();
    const hint = document.getElementById(
      field.getAttribute("aria-describedby")!
    );
    expect(hint?.textContent).toBe("Enter sends, Shift+Enter adds a new line.");
  });

  it("adds a line on Enter on touch screens, where Send sends", async () => {
    stubPointer(true);
    const user = userEvent.setup();
    const { onSend, field } = renderComposer();

    await user.type(field, "Hi{Enter}there");
    expect(onSend).not.toHaveBeenCalled();
    expect(field.value).toBe("Hi\nthere");
    expect(
      document.getElementById(field.getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Use the Send button to send.");
  });

  it("won't send blank text or more than 1,000 characters", async () => {
    stubPointer(false);
    const user = userEvent.setup();
    const { onSend, field } = renderComposer();
    const send = screen.getByRole("button", { name: "Send" });

    await user.type(field, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.clear(field);
    await user.click(field);
    await user.paste("x".repeat(1_001));
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText("1 character over the limit")).toHaveLength(2);
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("offers Send and Request credits in the + menu", async () => {
    const user = userEvent.setup();
    const onMoney = vi.fn();
    renderComposer(onMoney);

    await user.click(
      screen.getByRole("button", { name: "Send or request credits" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Request credits" }));
    expect(onMoney).toHaveBeenCalledWith("request");
  });

  it("has no + menu while credits can't move here", () => {
    renderComposer();
    expect(
      screen.queryByRole("button", { name: "Send or request credits" })
    ).toBeNull();
  });
});
