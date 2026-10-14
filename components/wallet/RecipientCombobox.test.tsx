// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testViewer } from "../../test/render";
import RecipientCombobox from "./RecipientCombobox";
import { fail, marco, ok, sarah, stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const users = [sarah, marco, testViewer].map((user) => ({
  ...user,
  accountType: "personal",
}));

function renderCombobox() {
  const onSelect = vi.fn();
  // Stands in for the dialog: Escape must not reach it while the list is open.
  const onOuterKeyDown = vi.fn();
  render(
    <div onKeyDown={(event) => onOuterKeyDown(event.key)}>
      <RecipientCombobox
        label="To"
        onSelect={onSelect}
        exclude={[testViewer.username]}
      />
    </div>
  );
  return { onSelect, onOuterKeyDown, input: screen.getByRole("combobox") };
}

describe("RecipientCombobox", () => {
  it("is an ARIA 1.2 combobox with a listbox it controls", async () => {
    const calls = stubApi({ "GET /api/users": ok({ items: users }) });
    const { input } = renderCombobox();
    const user = userEvent.setup();

    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    const listbox = document.getElementById(
      input.getAttribute("aria-controls") ?? ""
    );
    expect(listbox?.getAttribute("role")).toBe("listbox");

    await user.type(input, "s");
    await waitFor(() =>
      expect(input.getAttribute("aria-expanded")).toBe("true")
    );
    // The viewer is never offered.
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain("Sarah Chen@sarahcodes");
    expect(options[1].textContent).toContain("Marco Rossi@devmarco");
    expect(calls.calls[0].url).toBe("/api/users?q=s&limit=8");

    // The count is announced politely and describes the field.
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("2 people found");
    expect(input.getAttribute("aria-describedby")).toBe(status.id);
  });

  it("moves the active option with the arrow keys and picks it with Enter", async () => {
    stubApi({ "GET /api/users": ok({ items: users }) });
    const { input, onSelect } = renderCombobox();
    const user = userEvent.setup();

    await user.type(input, "s");
    await screen.findAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();

    await user.keyboard("{ArrowDown}");
    const [first, second] = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");
    // Focus stays in the field, so the highlight is the focus indicator:
    // a primary outline (3:1 or more in both themes), not only a tint.
    expect(first.className.split(" ")).toEqual(
      expect.arrayContaining([
        "aria-selected:outline",
        "aria-selected:outline-2",
        "aria-selected:outline-primary",
      ])
    );
    expect(document.activeElement).toBe(input);

    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(second.id);
    expect(first.getAttribute("aria-selected")).toBe("false");
    // It wraps around.
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    await user.keyboard("{ArrowUp}");
    expect(input.getAttribute("aria-activedescendant")).toBe(second.id);

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(marco);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("picks with the pointer, keeping focus in the field", async () => {
    stubApi({ "GET /api/users": ok({ items: users }) });
    const { input, onSelect } = renderCombobox();
    const user = userEvent.setup();

    await user.type(input, "sa");
    await user.click(await screen.findByRole("option", { name: /Sarah Chen/ }));
    expect(onSelect).toHaveBeenCalledWith(sarah);
  });

  it("closes the list on Escape, then clears, and only then lets Escape through", async () => {
    stubApi({ "GET /api/users": ok({ items: users }) });
    const { input, onOuterKeyDown } = renderCombobox();
    const user = userEvent.setup();

    await user.type(input, "s");
    await screen.findAllByRole("option");
    onOuterKeyDown.mockClear();

    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input).toHaveProperty("value", "s");
    expect(onOuterKeyDown).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(input).toHaveProperty("value", "");
    expect(onOuterKeyDown).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onOuterKeyDown).toHaveBeenCalledWith("Escape");
  });

  it("says when no one matches, and when the search fails", async () => {
    stubApi({
      "GET /api/users": (call) =>
        call.url.includes("q=zz")
          ? ok({ items: [] })
          : fail(500, "internal_error", "Something went wrong. Try again."),
    });
    const { input } = renderCombobox();
    const user = userEvent.setup();

    await user.type(input, "zz");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "No one found for “zz”"
      )
    );
    expect(input.getAttribute("aria-expanded")).toBe("false");

    await user.clear(input);
    await user.type(input, "x");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Something went wrong. Try again."
      )
    );
  });
});
