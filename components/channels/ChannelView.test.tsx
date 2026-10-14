// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithStore } from "../../test/render";
import { ChannelRole, IChannel, IMessage } from "../../types/Message";
import {
  at,
  channel,
  channelMessage,
  channelPageState,
  HANDLE,
  marco,
  page,
  sarah,
  viewer,
} from "./testFixtures";

const api = vi.hoisted(() => ({
  listChannels: vi.fn(),
  createChannel: vi.fn(),
  getChannel: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  listMembers: vi.fn(),
  setRole: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  removeMessage: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("../../lib/client/channelsApi", () => ({ channelsApi: api }));

const { default: ChannelView, CHANNEL_POLL_MS } = await import("./ChannelView");

const fromSarah = channelMessage("m1", sarah, at("09:00"), "Lunch at Ulus?");
const alsoSarah = channelMessage("m2", sarah, at("09:01"), "Lahmacun!");
const fromMarco = channelMessage("m3", marco, at("09:05"), "In!");
const mine = channelMessage("m4", viewer, at("09:10"), "Me too");
const thread = [fromSarah, alsoSarah, fromMarco, mine];

beforeEach(() => {
  api.listMessages.mockResolvedValue(page(thread));
  api.markRead.mockResolvedValue(undefined);
  api.listMembers.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderView({
  role = "member",
  open,
  messages = thread,
  readOnly = false,
}: {
  role?: ChannelRole | null;
  open?: IChannel;
  messages?: IMessage[];
  readOnly?: boolean;
} = {}) {
  const current = open ?? channel(role);
  api.getChannel.mockResolvedValue({ channel: current });
  return renderWithStore(<ChannelView handle={HANDLE} />, {
    state: channelPageState({ open: current, messages, readOnly }),
    path: `/channels/${HANDLE}`,
  });
}

const log = () => screen.getByRole("log", { name: `Messages in #${HANDLE}` });
const optionsFor = (text: string) =>
  within(log())
    .getByText(text)
    .closest("li")!
    .querySelector<HTMLButtonElement>('button[aria-label="Message options"]');

describe("ChannelView", () => {
  it("shows the channel, its size and every other person's name once per run", () => {
    renderView();
    expect(
      screen.getByRole("heading", { level: 1, name: `#${HANDLE}` })
    ).toBeTruthy();
    expect(screen.getByText("Ankara eats · 4 members")).toBeTruthy();

    // Sarah's two messages are one run: her name shows once; yours none.
    expect(within(log()).getAllByText("Sarah Chen")).toHaveLength(1);
    expect(within(log()).getAllByText("Marco Rossi")).toHaveLength(1);
    expect(within(log()).queryByText("Ilhan Ozkan")).toBeNull();
    // Screen readers hear the author with every message.
    expect(within(log()).getAllByText("Sarah Chen:")).toHaveLength(2);
    expect(within(log()).getByText("You:")).toBeTruthy();
  });

  describe("for someone who hasn't joined", () => {
    it("shows Join to send messages instead of the composer", () => {
      renderView({ role: null });
      expect(screen.getByText("Join to send messages")).toBeTruthy();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(
        screen.getAllByRole("button", { name: `Join #${HANDLE}` })
      ).toHaveLength(2);
      expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
      expect(optionsFor("Lunch at Ulus?")).toBeNull();
    });

    it("joins, then the composer takes the bar's place and focus", async () => {
      const user = userEvent.setup();
      renderView({ role: null });
      api.join.mockResolvedValue({
        channel: channel("member", { memberCount: 5 }),
      });

      const bar = screen.getByText("Join to send messages").parentElement!;
      await user.click(
        within(bar).getByRole("button", { name: `Join #${HANDLE}` })
      );

      expect(api.join).toHaveBeenCalledWith(HANDLE);
      const composer = await screen.findByRole("textbox", {
        name: `Message #${HANDLE}`,
      });
      await waitFor(() => expect(document.activeElement).toBe(composer));
      expect(screen.queryByText("Join to send messages")).toBeNull();
      expect(screen.getByText("Ankara eats · 5 members")).toBeTruthy();
    });

    it("keeps the bar and says why when joining fails", async () => {
      const user = userEvent.setup();
      const { store } = renderView({ role: null });
      api.join.mockRejectedValue(new Error("Check your connection"));
      const bar = screen.getByText("Join to send messages").parentElement!;
      await user.click(within(bar).getByRole("button"));
      await waitFor(() =>
        expect(store.getState().ui.toasts.at(-1)).toMatchObject({
          tone: "error",
        })
      );
      expect(screen.getByText("Join to send messages")).toBeTruthy();
    });
  });

  describe("for members", () => {
    it("sends text optimistically through the channel", async () => {
      const user = userEvent.setup();
      renderView();
      let resolve: (value: { message: IMessage }) => void = () => {};
      api.sendMessage.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        })
      );

      await user.type(
        screen.getByRole("textbox", { name: `Message #${HANDLE}` }),
        "On my way{Enter}"
      );
      expect(api.sendMessage).toHaveBeenCalledWith(
        HANDLE,
        { text: "On my way" },
        expect.any(String)
      );
      expect(within(log()).getByText("Sending…")).toBeTruthy();

      await act(async () =>
        resolve({
          message: channelMessage("m5", viewer, at("09:20"), "On my way"),
        })
      );
      expect(within(log()).queryByText("Sending…")).toBeNull();
      expect(within(log()).getByText("On my way")).toBeTruthy();
    });

    it("lets members delete only their own messages", () => {
      renderView({ role: "member" });
      expect(optionsFor("Lunch at Ulus?")).toBeNull();
      expect(optionsFor("Me too")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: `Leave #${HANDLE}` })
      ).toBeTruthy();
    });

    it("leaves, with focus on Join again", async () => {
      const user = userEvent.setup();
      renderView({ role: "member" });
      api.leave.mockResolvedValue({ channel: channel(null) });
      await user.click(
        screen.getByRole("button", { name: `Leave #${HANDLE}` })
      );
      expect(api.leave).toHaveBeenCalledWith(HANDLE);
      await screen.findByText("Join to send messages");
      await waitFor(() =>
        expect(document.activeElement?.textContent).toBe(`Join #${HANDLE}`)
      );
    });

    it("doesn't offer the owner a way out", () => {
      renderView({ role: "owner" });
      expect(screen.queryByRole("button", { name: /^Leave/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Join/ })).toBeNull();
    });
  });

  describe("moderation", () => {
    it("gives moderators Delete message on everyone's messages", async () => {
      const user = userEvent.setup();
      renderView({ role: "moderator" });
      api.removeMessage.mockResolvedValue(undefined);

      for (const text of ["Lunch at Ulus?", "In!", "Me too"]) {
        expect(optionsFor(text), text).toBeTruthy();
      }
      await user.click(optionsFor("In!")!);
      await user.click(
        screen.getByRole("menuitem", { name: "Delete message" })
      );

      const dialog = screen.getByRole("dialog", { name: "Delete message?" });
      expect(dialog.textContent).toContain(
        "“Message removed by a moderator” in its place"
      );
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));

      expect(api.removeMessage).toHaveBeenCalledWith(HANDLE, "m3");
      expect(
        await within(log()).findByText("Message removed by a moderator")
      ).toBeTruthy();
      expect(within(log()).queryByText("In!")).toBeNull();
      // Its menu went with it: focus stays in the log.
      await waitFor(() => expect(document.activeElement).toBe(log()));
    });

    it("says “Message deleted” when the author deletes their own", async () => {
      const user = userEvent.setup();
      renderView({ role: "moderator" });
      api.removeMessage.mockResolvedValue(undefined);
      await user.click(optionsFor("Me too")!);
      await user.click(
        screen.getByRole("menuitem", { name: "Delete message" })
      );
      const dialog = screen.getByRole("dialog", { name: "Delete message?" });
      expect(dialog.textContent).toContain("“Message deleted” in its place");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(await within(log()).findByText("Message deleted")).toBeTruthy();
    });

    it("keeps the dialog open with the reason when deleting fails", async () => {
      const user = userEvent.setup();
      renderView({ role: "owner" });
      api.removeMessage.mockRejectedValue(new Error("Something went wrong"));
      await user.click(optionsFor("Lunch at Ulus?")!);
      await user.click(
        screen.getByRole("menuitem", { name: "Delete message" })
      );
      const dialog = screen.getByRole("dialog", { name: "Delete message?" });
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect((await within(dialog).findByRole("alert")).textContent).toBe(
        "Something went wrong"
      );
      expect(within(log()).getByText("Lunch at Ulus?")).toBeTruthy();
    });

    it("never offers to delete a removed message", () => {
      renderView({
        role: "moderator",
        messages: [
          {
            ...fromMarco,
            body: { type: "removed", by: "moderator" },
          },
        ],
      });
      expect(
        within(log()).getByText("Message removed by a moderator")
      ).toBeTruthy();
      expect(
        within(log()).queryByRole("button", { name: "Message options" })
      ).toBeNull();
    });
  });

  it("offers nothing to write in READ_ONLY", () => {
    renderView({ role: "moderator", readOnly: true });
    expect(
      screen.getByText("Messaging is turned off on this read-only demo.")
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Join|Leave)/ })).toBeNull();
    expect(
      within(log()).queryByRole("button", { name: "Message options" })
    ).toBeNull();
  });

  it("polls every 4 s and marks a member's unread messages read", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderView({
      open: channel("member", { viewer: { role: "member", unread: 2 } }),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANNEL_POLL_MS);
    });
    expect(api.getChannel).toHaveBeenCalledWith(HANDLE);
    expect(api.listMessages).toHaveBeenCalledWith(HANDLE, { limit: 50 });
    expect(api.markRead).toHaveBeenCalledWith(HANDLE);
  });

  it("never marks read for someone who hasn't joined", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderView({ open: channel(null, { viewer: { role: null, unread: 3 } }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHANNEL_POLL_MS * 2);
    });
    expect(api.markRead).not.toHaveBeenCalled();
  });
});
