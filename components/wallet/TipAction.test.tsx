// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconType } from "react-icons";
import { RiCoinFill, RiCoinLine } from "react-icons/ri";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { ITweet } from "../../types/Tweet";
import TweetActions from "../tweet/TweetActions";
import TipAction, { TipActionProps } from "./TipAction";
import { tweet } from "./testing";

afterEach(() => {
  cleanup();
});

function renderTip(
  value: ITweet,
  {
    readOnly = false,
    wallet = true,
    ...props
  }: Partial<TipActionProps> & { readOnly?: boolean; wallet?: boolean } = {}
) {
  return renderWithStore(
    <TipAction tweet={value} showCount size="md" {...props} />,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: wallet ? featuresWith("wallet") : featuresWith(),
        }),
      },
    }
  );
}

/** The path an icon draws, to tell the outline coin from the filled one. */
function iconPath(Icon: IconType) {
  const { container, unmount } = render(<Icon />);
  const d = container.querySelector("path")?.getAttribute("d");
  unmount();
  return d;
}

const pathIn = (element: Element) =>
  element.querySelector("svg path")?.getAttribute("d");

describe("TipAction", () => {
  it("offers a tip on someone else's Tweet, with the count in words", async () => {
    const { store } = renderTip(
      tweet({ stats: { ...tweet().stats, tips: 3 } })
    );
    const button = screen.getByRole("button", { name: "Tip. 3 tips" });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.textContent).toBe("3");
    expect(button.className).toContain("text-muted");
    expect(button.className).toContain("hover:text-tip");
    expect(pathIn(button)).toBe(iconPath(RiCoinLine));

    await userEvent.setup().click(button);
    expect(store.getState().ui.dialog).toBe("tip");
    expect(store.getState().ui.dialogArgs).toEqual({ tweetId: "seed-t03" });
  });

  it("counts one tip in the singular, and shows no number for none", () => {
    renderTip(tweet({ stats: { ...tweet().stats, tips: 1 } }));
    expect(screen.getByRole("button", { name: "Tip. 1 tip" })).toBeTruthy();
    cleanup();

    renderTip(tweet({ stats: { ...tweet().stats, tips: 0 } }));
    expect(
      screen.getByRole("button", { name: "Tip. 0 tips" }).textContent
    ).toBe("");
  });

  it("is filled and amber once the viewer has tipped", () => {
    renderTip(
      tweet({
        stats: { ...tweet().stats, tips: 3 },
        viewer: { ...tweet().viewer, tipped: true },
      })
    );
    const button = screen.getByRole("button", {
      name: "Tip again. You tipped this Tweet. 3 tips",
    });
    expect(button.className).toContain("text-tip");
    expect(button.className).not.toContain("text-muted");
    expect(pathIn(button)).toBe(iconPath(RiCoinFill));
  });

  it("is plain text on your own Tweet, keeping its place in the row", () => {
    const { container } = renderTip(
      tweet({ author: testViewer, stats: { ...tweet().stats, tips: 3 } })
    );
    expect(screen.queryByRole("button")).toBeNull();
    // Read once, in words; the visible number is for sighted readers.
    expect(screen.getByText("3 tips").className).toContain("sr-only");
    const visible = screen.getByText("3");
    expect(visible.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".bubble svg")).not.toBeNull();
  });

  it("is disabled on a read-only demo, like the reactions", () => {
    renderTip(tweet(), { readOnly: true });
    expect(
      screen
        .getByRole("button", { name: "Tip. 2 tips" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("is not there while the wallet is off", () => {
    const { container } = renderTip(tweet(), { wallet: false });
    expect(container.innerHTML).toBe("");
  });

  it("leaves the count to the Tweet's page when asked to", () => {
    renderTip(tweet(), { showCount: false, size: "lg" });
    const button = screen.getByRole("button", { name: "Tip. 2 tips" });
    expect(button.textContent).toBe("");
    expect(button.querySelector(".bubble")?.className).toContain("text-[22px]");
  });
});

describe("the action row with Tip", () => {
  const counted = tweet({
    author: { username: "sarahcodes", fullname: "Sarah Chen", image: null },
    stats: { replies: 12, retweets: 34, likes: 56, tips: 78 },
  });

  function renderRow() {
    renderWithStore(<TweetActions tweet={counted} />, {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features: featuresWith("wallet"),
        }),
      },
    });
    return within(screen.getByRole("group", { name: "Tweet actions" }));
  }

  it("has six actions, Tip between Like and Bookmark", () => {
    const row = renderRow();
    expect(
      row.getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    ).toEqual([
      "Retweet. 34 Retweets",
      "Like. 56 Likes",
      "Tip. 78 tips",
      "Bookmark",
      "Copy link to Tweet",
    ]);
    expect(row.getByRole("link", { name: "Reply. 12 replies" })).toBeTruthy();
  });

  // jsdom has no layout, so the width is worked out from the classes: each
  // action is its icon plus p-2 on both sides, then its count at 13px.
  const LAYOUT =
    /^(group|-my-[\d.]+|flex|items-\w+|transition-\w+|duration-\d+|disabled:.+)$/;
  const layout = (element: Element) =>
    element.className
      .split(/\s+/)
      .filter((name) => LAYOUT.test(name))
      .join(" ");

  function width(action: Element): number {
    const bubble = action.querySelector(".bubble")!;
    expect(bubble.className).toMatch(/\bp-2\b/);
    const icon = bubble.className.includes("text-lg") ? 18 : 22;
    const count = action.querySelector(".tabular-nums");
    // A digit is about 0.6em; an empty count still takes 1ch.
    const digits = count ? Math.max(1, count.textContent?.length ?? 0) : 0;
    return 2 * 8 + icon + digits * 13 * 0.6;
  }

  it("gives Tip the same box as Like", () => {
    const row = renderRow();
    const like = row.getByRole("button", { name: /^Like/ });
    const tip = row.getByRole("button", { name: /^Tip/ });
    expect(layout(tip)).toBe(layout(like));
    expect(tip.querySelector(".bubble")?.className).toBe(
      like.querySelector(".bubble")?.className
    );
    expect(tip.querySelector(".tabular-nums")?.className).toBe(
      like.querySelector(".tabular-nums")?.className
    );
  });

  it("fits a 360px phone with two-digit counts everywhere", () => {
    const row = renderRow();
    const group = screen.getByRole("group", { name: "Tweet actions" });
    const actions = Array.from(group.children);
    expect(actions).toHaveLength(6);
    expect(row.getByRole("button", { name: /^Tip/ }).parentElement).toBe(group);
    // TweetCard at 360px: px-4 on both sides, the 40px avatar, gap-3, and
    // the row's -ml-2 gives back 8px.
    const room = 360 - 2 * 16 - 40 - 12 + 8;
    expect(group.className).toContain("justify-between");
    const total = actions.reduce((sum, action) => sum + width(action), 0);
    expect(total).toBeLessThanOrEqual(room);
  });
});
