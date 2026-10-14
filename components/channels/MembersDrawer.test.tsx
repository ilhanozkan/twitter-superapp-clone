// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithStore } from "../../test/render";
import { ChannelRole, IChannelMember } from "../../types/Message";
import MembersDrawer from "./MembersDrawer";
import { channel, channelPageState, marco, owner, sarah } from "./testFixtures";

const api = vi.hoisted(() => ({ listMembers: vi.fn(), setRole: vi.fn() }));
vi.mock("../../lib/client/channelsApi", () => ({ channelsApi: api }));

const member = (
  user: IChannelMember["user"],
  role: ChannelRole
): IChannelMember => ({ user, role });

beforeEach(() => {
  api.listMembers.mockResolvedValue({
    items: [
      member(owner, "owner"),
      member(marco, "member"),
      member(sarah, "member"),
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDrawer(role: ChannelRole | null, readOnly = false) {
  const open = channel(role);
  return renderWithStore(
    <MembersDrawer channel={open} open onClose={() => {}} />,
    { state: channelPageState({ open, readOnly }) }
  );
}

const section = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section")!;

describe("MembersDrawer", () => {
  it("lists the owner, moderators and members", async () => {
    renderDrawer(null);
    const dialog = screen.getByRole("dialog", { name: "#ankara_eats" });
    expect(dialog.textContent).toContain("Favourite spots around Ankara.");
    expect(dialog.textContent).toContain("4 members");

    await screen.findByRole("heading", { name: "Members" });
    expect(api.listMembers).toHaveBeenCalledWith("ankara_eats");
    expect(within(section("Owner")).getByText("Mert Demir")).toBeTruthy();
    expect(section("Moderators").textContent).toContain("No moderators yet.");
    expect(
      within(section("Members"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/devmarco", "/sarahcodes"]);
    // Only the owner changes roles.
    expect(screen.queryByRole("button", { name: /moderator/ })).toBeNull();
  });

  it("lets the owner make a moderator, with focus following them", async () => {
    const user = userEvent.setup();
    renderDrawer("owner");
    api.setRole.mockResolvedValue({ channel: channel("owner") });
    await screen.findByRole("heading", { name: "Members" });

    api.listMembers.mockResolvedValue({
      items: [
        member(owner, "owner"),
        member(sarah, "moderator"),
        member(marco, "member"),
      ],
    });
    await user.click(
      screen.getByRole("button", { name: "Make moderator: Sarah Chen" })
    );

    expect(api.setRole).toHaveBeenCalledWith(
      "ankara_eats",
      "sarahcodes",
      "moderator"
    );
    const demote = await within(section("Moderators")).findByRole("button", {
      name: "Remove moderator: Sarah Chen",
    });
    await waitFor(() => expect(document.activeElement).toBe(demote));
    expect(within(section("Owner")).queryByRole("button")).toBeNull();
  });

  it("offers no role changes in READ_ONLY", async () => {
    renderDrawer("owner", true);
    await screen.findByRole("heading", { name: "Members" });
    expect(screen.queryByRole("button", { name: /moderator/ })).toBeNull();
  });

  it("says when the members can't be read, with Retry", async () => {
    api.listMembers.mockRejectedValue(new Error("Offline"));
    renderDrawer("member");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Offline");

    api.listMembers.mockResolvedValue({ items: [member(owner, "owner")] });
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Owner" })).toBeTruthy();
  });
});
