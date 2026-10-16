// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import WalletActions, { WalletActionsProps } from "./WalletActions";

afterEach(() => {
  cleanup();
});

function renderActions(
  variant: WalletActionsProps["variant"],
  readOnly = false
) {
  return renderWithStore(<WalletActions variant={variant} />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly,
        features: featuresWith("wallet"),
      }),
    },
  });
}

const names = () =>
  screen.getAllByRole("button").map((button) => button.textContent);

describe("WalletActions", () => {
  it("offers Send, Request and Add credits on the page and Services", () => {
    for (const variant of ["page", "services"] as const) {
      renderActions(variant);
      expect(names()).toEqual(["Send", "Request", "Add credits"]);
      cleanup();
    }
  });

  it("offers Send and Add in the right column", () => {
    renderActions("sidebar");
    expect(names()).toEqual(["Send", "Add"]);
  });

  it("opens each dialog", async () => {
    const { store } = renderActions("page");
    const user = userEvent.setup();
    for (const [name, dialog] of [
      ["Send", "send"],
      ["Request", "request"],
      ["Add credits", "topUp"],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-haspopup")).toBe("dialog");
      await user.click(button);
      expect(store.getState().ui.dialog).toBe(dialog);
    }
  });

  it("stacks the icon above the label on phones, at least 44px tall", () => {
    renderActions("page");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send.parentElement?.className).toContain("grid-cols-3");
    expect(send.className).toContain("min-h-[44px]");
    expect(send.className).toContain("max-xs:flex-col");
  });

  it("renders nothing on a read-only demo", () => {
    renderActions("page", true);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
