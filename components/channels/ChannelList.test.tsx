// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { channelsState } from "../../slices/channelsSlice";
import { sessionState } from "../../slices/sessionSlice";
import { useAppSelector } from "../../store";
import { featuresWith, renderWithStore } from "../../test/render";
import { IChannel } from "../../types/Message";
import ChannelList, { ChannelPane } from "./ChannelList";
import { channel, fullText, viewer } from "./testFixtures";

const api = vi.hoisted(() => ({ join: vi.fn() }));
vi.mock("../../lib/client/channelsApi", () => ({ channelsApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const builders = channel("moderator", {
  id: "channel-superapp_builders",
  handle: "superapp_builders",
  name: "SuperApp builders",
  description: null,
  memberCount: 5,
  viewer: { role: "moderator", unread: 1 },
});
const eats = channel(null);

/** Discover as the page renders it: from the store, so joins show. */
function Discover() {
  const { items, error } = useAppSelector((state) => state.channels.discover);
  return (
    <ChannelList
      label="Discover"
      channels={items}
      error={error}
      onRetry={() => {}}
      empty={<p>No channels yet</p>}
    />
  );
}

function renderList(
  discover: IChannel[] | null,
  { readOnly = false }: { readOnly?: boolean } = {}
) {
  return renderWithStore(<Discover />, {
    state: {
      session: sessionState({
        viewer,
        readOnly,
        features: featuresWith("channels"),
      }),
      channels: channelsState({ mine: [builders], discover }),
    },
  });
}

const card = (name: string) =>
  screen.getByRole("article", { name }) as HTMLElement;

describe("ChannelList", () => {
  it("shows each channel's name, handle, size, description and your part in it", () => {
    renderList([builders, eats]);
    const list = screen.getByRole("region", { name: "Discover" });
    expect(within(list).getAllByRole("article")).toHaveLength(2);

    const mine = card("SuperApp builders");
    // The count is its own part of the line, so on a phone it wraps below
    // the handle instead of being cut off.
    const line = within(mine).getByText(
      fullText("#superapp_builders · 5 members")
    );
    expect(within(line).getByText(/5 members/).textContent).not.toContain(
      "#superapp_builders"
    );
    expect(within(mine).getByText("Moderator")).toBeTruthy();
    expect(within(mine).getByText("1 new message")).toBeTruthy();
    expect(
      within(mine).getByRole("link", { name: "SuperApp builders" })
    ).toHaveProperty(
      "href",
      expect.stringMatching(/\/channels\/superapp_builders$/)
    );

    const other = card("Ankara eats");
    expect(other.textContent).toContain("#ankara_eats · 4 members");
    expect(other.textContent).toContain("Favourite spots around Ankara.");
    expect(
      within(other).getByRole("button", { name: "Join #ankara_eats" })
    ).toBeTruthy();
  });

  it("joins from a card: the card then says Joined", async () => {
    const user = userEvent.setup();
    const { store } = renderList([builders, eats]);
    api.join.mockResolvedValue({
      channel: channel("member", { memberCount: 5 }),
    });

    await user.click(screen.getByRole("button", { name: "Join #ankara_eats" }));
    expect(api.join).toHaveBeenCalledWith("ankara_eats");
    await waitFor(() =>
      expect(within(card("Ankara eats")).getByText("Joined")).toBeTruthy()
    );
    // The button is gone: focus moves to the card's link, not the page.
    expect(document.activeElement).toBe(
      within(card("Ankara eats")).getByRole("link", { name: "Ankara eats" })
    );
    expect(card("Ankara eats").textContent).toContain("5 members");
    // It is one of yours now.
    expect(
      store.getState().channels.mine.items.map((item) => item.handle)
    ).toContain("ankara_eats");
  });

  it("hides Join in READ_ONLY", () => {
    renderList([eats], { readOnly: true });
    expect(screen.queryByRole("button", { name: /^Join/ })).toBeNull();
  });

  it("shows the empty state, or the error with Retry", async () => {
    renderList([]);
    expect(screen.getByText("No channels yet")).toBeTruthy();
    cleanup();

    renderList(null);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Channels can’t be loaded right now.");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("ChannelPane", () => {
  it("lists your channels beside the open one, unread ones marked", () => {
    renderWithStore(<ChannelPane selected="superapp_builders" />, {
      state: { channels: channelsState({ mine: [builders] }) },
    });
    const nav = screen.getByRole("navigation", { name: "Your channels" });
    const link = within(nav).getByRole("link", { name: /SuperApp builders/ });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.textContent).toContain(", unread");
  });
});
