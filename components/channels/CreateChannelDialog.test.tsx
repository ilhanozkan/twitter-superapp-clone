// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../lib/client/request";
import { renderWithStore } from "../../test/render";
import { channel } from "./testFixtures";

const api = vi.hoisted(() => ({ createChannel: vi.fn() }));
vi.mock("../../lib/client/channelsApi", () => ({ channelsApi: api }));

const { default: CreateChannelDialog, suggestHandle } =
  await import("./CreateChannelDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog() {
  const onClose = vi.fn();
  const result = renderWithStore(
    <CreateChannelDialog open onClose={onClose} />,
    { path: "/channels" }
  );
  const dialog = screen.getByRole("dialog", { name: "Create channel" });
  const field = (name: RegExp) => within(dialog).getByLabelText(name);
  return {
    ...result,
    onClose,
    dialog,
    name: field(/^Name/) as HTMLInputElement,
    handle: field(/^Handle/) as HTMLInputElement,
    description: field(/^Description/) as HTMLTextAreaElement,
    submit: within(dialog).getByRole("button", { name: "Create channel" }),
  };
}

describe("suggestHandle", () => {
  it("turns a name into a handle", () => {
    expect(suggestHandle("Ankara Eats!")).toBe("ankara_eats");
    expect(suggestHandle("  Çay & Kod  ")).toBe("cay_kod");
    expect(suggestHandle("Işık Ölçer")).toBe("isik_olcer");
    expect(suggestHandle("x".repeat(40))).toHaveLength(30);
  });
});

describe("CreateChannelDialog", () => {
  it("suggests the handle from the name until it is edited", async () => {
    const user = userEvent.setup();
    const { name, handle } = renderDialog();
    expect(document.activeElement).toBe(name);

    await user.type(name, "Night Shift");
    expect(handle.value).toBe("night_shift");

    await user.clear(handle);
    await user.type(handle, "Owls Only");
    expect(handle.value).toBe("owls_only");
    await user.type(name, "!");
    expect(handle.value).toBe("owls_only");
  });

  it("explains what is wrong next to the field, and focuses it", async () => {
    const user = userEvent.setup();
    const { name, handle, submit } = renderDialog();

    await user.click(submit);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(
      document.getElementById(name.getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Give the channel a name.");

    await user.type(name, "Go");
    await user.click(submit);
    expect(document.activeElement).toBe(handle);
    expect(handle.getAttribute("aria-describedby")).toContain("-error");
    expect(api.createChannel).not.toHaveBeenCalled();
  });

  it("creates the channel and opens it", async () => {
    const user = userEvent.setup();
    const { name, description, submit, onClose, router, store } =
      renderDialog();
    api.createChannel.mockResolvedValue({
      channel: channel("owner", { handle: "night_shift", name: "Night shift" }),
    });

    await user.type(name, "  Night shift ");
    await user.type(description, "   ");
    await user.click(submit);

    expect(api.createChannel).toHaveBeenCalledWith({
      handle: "night_shift",
      name: "Night shift",
      description: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(router.push).toHaveBeenCalledWith("/channels/night_shift");
    expect(store.getState().channels.mine.items[0].handle).toBe("night_shift");
    expect(store.getState().ui.toasts.at(-1)?.message).toBe(
      "#night_shift is ready"
    );
  });

  it("points at the handle when it is taken", async () => {
    const user = userEvent.setup();
    const { name, handle, submit, onClose } = renderDialog();
    api.createChannel.mockRejectedValue(
      new ApiRequestError(409, "conflict", "That handle is taken")
    );
    await user.type(name, "Ankara eats");
    await user.click(submit);

    await waitFor(() => expect(document.activeElement).toBe(handle));
    expect(handle.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("That handle is taken. Try another one.")
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows other refusals, like the 3-channel limit, as an alert", async () => {
    const user = userEvent.setup();
    const { name, submit, dialog } = renderDialog();
    api.createChannel.mockRejectedValue(
      new ApiRequestError(
        422,
        "limit_exceeded",
        "You can create up to 3 channels"
      )
    );
    await user.type(name, "Fourth room");
    await user.click(submit);
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "You can create up to 3 channels"
    );
  });
});
