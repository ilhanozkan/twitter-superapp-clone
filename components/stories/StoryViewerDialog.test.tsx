// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { SEEN_STORAGE_KEY } from "../../slices/storiesSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import StoryDialogs from "./StoryDialogs";
import {
  installPointerEvent,
  lena,
  me,
  mert,
  story,
  stubReducedMotion,
  stubStoriesApi,
  text,
  unstubMatchMedia,
} from "./testing";
import { viewerArgs } from "./viewerArgs";

const sunrise = {
  type: "image" as const,
  image: "/media/mountains.svg",
  alt: "Sunrise over mountain peaks",
  caption: "Dolomites, 5:42am",
};

let stories: ReturnType<typeof fixtures>;

function fixtures() {
  return {
    mert1: story("m1", mert, text("Lahmacun crawl tonight")),
    mert2: story("m2", mert, text("Who's in? 🌯")),
    lena1: story("l1", lena, sunrise, { hoursAgo: 8 }),
    mine: story("s1", me, text("Building in public"), { views: 3 }),
  };
}

function api(options?: Parameters<typeof stubStoriesApi>[1]) {
  return stubStoriesApi(
    {
      foodie_ankara: [stories.mert1, stories.mert2],
      lenaframes: [stories.lena1],
      illlhanozkan: [stories.mine],
    },
    options
  );
}

/** Renders the dialogs next to an "Opener" button that has focus, then opens the viewer. */
function openViewer({
  authors = [mert.username, lena.username],
  from,
  storyId,
  readOnly = false,
  features = ["stories"],
}: {
  authors?: string[];
  from?: string;
  storyId?: string;
  readOnly?: boolean;
  features?: (keyof IFeatures)[];
} = {}) {
  const result = renderWithStore(
    <>
      <button type="button">Opener</button>
      <StoryDialogs />
    </>,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith(...features),
        }),
      },
    }
  );
  screen.getByRole("button", { name: "Opener" }).focus();
  act(() => {
    result.store.dispatch(
      openDialog("storyViewer", viewerArgs(authors, { from, story: storyId }))
    );
  });
  return result;
}

/** Lets fetches settle (and moves fake time on). */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const position = () =>
  document.querySelector("[aria-live='polite']")?.textContent ?? "";
const press = (key: string, target: Element = screen.getByRole("dialog")) =>
  fireEvent.keyDown(target, { key });
const viewsPosted = (
  calls: { method: string; path: string; body: unknown }[]
) =>
  calls
    .filter((call) => call.path === "/api/stories/views")
    .map((call) => (call.body as { ids: string[] }).ids);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
  });
  stories = fixtures();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  unstubMatchMedia();
});

describe("StoryViewerDialog", () => {
  it("opens on the first unseen story and announces where it is", async () => {
    stories.mert1.viewer.seen = true;
    api();
    openViewer();
    await settle();

    expect(screen.getByRole("dialog", { name: "Stories" })).toBeTruthy();
    expect(screen.getByText("Who's in? 🌯")).toBeTruthy();
    expect(position()).toBe("Story 2 of 2 by Mert Demir, posted 2 hours ago");
  });

  it("moves with ← and →, on to the next account, and closes after the last", async () => {
    api();
    const { store } = openViewer();
    await settle();
    expect(position()).toMatch(/^Story 1 of 2 by Mert Demir/);

    press("ArrowRight");
    expect(position()).toMatch(/^Story 2 of 2 by Mert Demir/);
    press("ArrowLeft");
    expect(position()).toMatch(/^Story 1 of 2 by Mert Demir/);

    press("ArrowRight");
    press("ArrowRight");
    await settle();
    expect(position()).toBe(
      "Story 1 of 1 by Lena Hoffmann, posted 8 hours ago"
    );
    expect(screen.getByAltText("Sunrise over mountain peaks")).toBeTruthy();
    expect(screen.getByText("Dolomites, 5:42am")).toBeTruthy();

    // Back across accounts lands on the previous one's last story.
    press("ArrowLeft");
    expect(position()).toMatch(/^Story 2 of 2 by Mert Demir/);

    press("ArrowRight");
    press("ArrowRight");
    expect(store.getState().ui.dialog).toBeNull();
  });

  it("has named Previous and Next buttons", async () => {
    api();
    openViewer();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    expect(position()).toMatch(/^Story 2 of 2/);
    fireEvent.click(screen.getByRole("button", { name: "Previous story" }));
    expect(position()).toMatch(/^Story 1 of 2/);
  });

  it("returns focus to whatever opened it", async () => {
    api();
    const { store } = openViewer({ authors: [lena.username] });
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Pause" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store.getState().ui.dialog).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Opener" })
    );
  });

  it("always shows Pause, which Space toggles too", async () => {
    api();
    openViewer();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    await settle(20_000);
    expect(position()).toMatch(/^Story 1 of 2/);

    press(" ");
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    await settle(5_000);
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("advances after 5 s for text and 6 s for a photo, once it has loaded", async () => {
    api();
    const { store } = openViewer();
    await settle();

    await settle(4_999);
    expect(position()).toMatch(/^Story 1 of 2/);
    await settle(1);
    expect(position()).toMatch(/^Story 2 of 2/);
    await settle(5_000);
    expect(position()).toMatch(/^Story 1 of 1 by Lena/);

    // The photo hasn't loaded: its time hasn't started.
    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 1 by Lena/);
    fireEvent.load(screen.getByAltText("Sunrise over mountain peaks"));
    await settle(5_999);
    expect(store.getState().ui.dialog).toBe("storyViewer");
    await settle(1);
    expect(store.getState().ui.dialog).toBeNull();
  });

  it("resumes where it paused instead of starting over", async () => {
    installPointerEvent();
    api();
    openViewer();
    await settle();
    const canvas = screen.getByText("Lahmacun crawl tonight");

    await settle(3_000);
    fireEvent.pointerEnter(canvas, { pointerType: "mouse" });
    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 2/);

    fireEvent.pointerLeave(canvas, { pointerType: "mouse" });
    await settle(1_999);
    expect(position()).toMatch(/^Story 1 of 2/);
    await settle(1);
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("pauses while the reply field has focus", async () => {
    api();
    openViewer({ features: ["stories", "messages"] });
    await settle();

    fireEvent.focus(screen.getByLabelText("Reply to Mert Demir"));
    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 2/);
    fireEvent.blur(screen.getByLabelText("Reply to Mert Demir"));
    await settle(5_000);
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("pauses while a finger holds the story, and a long press doesn't move on", async () => {
    installPointerEvent();
    api();
    openViewer();
    await settle();
    const zone = screen.getByRole("button", { name: "Next story" });

    fireEvent.pointerDown(zone, { pointerType: "touch" });
    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 2/);
    fireEvent.pointerUp(zone, { pointerType: "touch" });
    fireEvent.click(zone);
    expect(position()).toMatch(/^Story 1 of 2/);

    // It plays on from where the hold began.
    await settle(4_999);
    expect(position()).toMatch(/^Story 1 of 2/);
    await settle(1);
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("moves on or back with a quick tap on the tap zones", async () => {
    installPointerEvent();
    api();
    openViewer();
    await settle();
    const tap = async (name: string) => {
      const zone = screen.getByRole("button", { name });
      fireEvent.pointerDown(zone, { pointerType: "touch" });
      await settle(200);
      fireEvent.pointerUp(zone, { pointerType: "touch" });
      fireEvent.click(zone);
    };

    await tap("Next story");
    expect(position()).toMatch(/^Story 2 of 2/);
    await tap("Previous story");
    expect(position()).toMatch(/^Story 1 of 2/);
  });

  it("pauses while the … menu has focus, so Delete acts on the story shown", async () => {
    stubStoriesApi({
      illlhanozkan: [stories.mine, story("s2", me, text("Second"))],
    });
    openViewer({ authors: [me.username] });
    await settle();

    act(() => {
      screen.getByRole("button", { name: "Story options" }).focus();
    });
    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 2 by Ilhan Ozkan/);

    act(() => {
      screen.getByRole("button", { name: "Pause" }).focus();
    });
    await settle(5_000);
    expect(position()).toMatch(/^Story 2 of 2 by Ilhan Ozkan/);
  });

  it("pauses while the tab is hidden", async () => {
    api();
    openViewer();
    await settle();

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 2/);

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle(5_000);
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("pauses while the viewers list is open", async () => {
    api({ viewers: [mert, lena] });
    openViewer({ authors: [me.username] });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Seen by 3" }));
    await settle(10_000);
    expect(screen.getByRole("dialog", { name: "Stories" })).toBeTruthy();
    expect(position()).toMatch(/^Story 1 of 1 by Ilhan Ozkan/);
  });

  it("never advances by itself with reduced motion, and the bars fill in steps", async () => {
    stubReducedMotion(true);
    api();
    openViewer();
    await settle();

    await settle(60_000);
    expect(position()).toMatch(/^Story 1 of 2/);
    const current = document.querySelector("[data-state='current']");
    expect((current as HTMLElement).style.transform).toBe("scaleX(1)");

    press("ArrowRight");
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("reports watched stories in batches every 3 s and when it closes", async () => {
    stories.mert1.viewer.seen = true;
    const { calls } = api();
    openViewer({ authors: [mert.username, lena.username], storyId: "m1" });
    await settle();
    press("ArrowRight");

    // m1 was already seen on the server: only m2 is new.
    await settle(2_999);
    expect(viewsPosted(calls)).toEqual([]);
    await settle(1);
    expect(viewsPosted(calls)).toEqual([["m2"]]);

    press("ArrowRight");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(viewsPosted(calls)).toEqual([["m2"], ["l1"]]);
  });

  it("READ_ONLY: keeps watched stories in sessionStorage and posts nothing", async () => {
    const { calls } = api();
    const { store } = openViewer({ readOnly: true });
    await settle();
    press("ArrowRight");
    await settle(3_000);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();

    expect(viewsPosted(calls)).toEqual([]);
    expect(store.getState().stories.seen).toEqual({ m1: true, m2: true });
    expect(
      JSON.parse(window.sessionStorage.getItem(SEEN_STORAGE_KEY) ?? "[]")
    ).toEqual(["m1", "m2"]);
  });

  it("replies to the author in a direct message with the story attached", async () => {
    vi.useRealTimers();
    const { calls } = api();
    openViewer({ features: ["stories", "messages"] });
    await screen.findByText("Lahmacun crawl tonight");

    const field = screen.getByLabelText("Reply to Mert Demir");
    expect(field.getAttribute("placeholder")).toBe("Reply to Mert…");
    fireEvent.change(field, { target: { value: "  I'm in!  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const link = await screen.findByRole("link", { name: "View in Messages" });
    expect(link.getAttribute("href")).toBe("/messages/conv-1");
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => [call.path, call.body])).toEqual([
      ["/api/conversations", { with: "foodie_ankara" }],
      [
        "/api/conversations/conv-1/messages",
        { text: "I'm in!", storyId: "m1" },
      ],
    ]);
    expect(posts[1].headers["Idempotency-Key"]).toMatch(
      /^[A-Za-z0-9_-]{8,64}$/
    );
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("keeps focus on Send while a reply goes out, and stays paused until focus leaves", async () => {
    const { calls } = api();
    openViewer({ features: ["stories", "messages"] });
    await settle();

    const field = screen.getByLabelText("Reply to Mert Demir");
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: "I'm in!" } });
    const send = screen.getByRole("button", { name: "Send" });
    act(() => {
      send.focus();
    });
    fireEvent.click(send);

    // A disabled button would drop focus to the page in browsers.
    expect(send.textContent).toBe("Sending…");
    expect((send as HTMLButtonElement).disabled).toBe(false);
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(send);

    await settle();
    expect(screen.getByRole("link", { name: "View in Messages" })).toBeTruthy();
    expect((send as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(send);
    // Nothing left to send: pressing it again sends nothing.
    fireEvent.click(send);
    await settle();
    expect(
      calls.filter((call) => call.path.endsWith("/messages"))
    ).toHaveLength(1);

    await settle(10_000);
    expect(position()).toMatch(/^Story 1 of 2/);
    act(() => {
      screen.getByRole("button", { name: "Pause" }).focus();
    });
    await settle(5_000);
    expect(position()).toMatch(/^Story 2 of 2/);
  });

  it("offers no reply while Messages is off, in READ_ONLY, or on your own story", async () => {
    api();
    openViewer();
    await settle();
    expect(screen.queryByLabelText(/^Reply to/)).toBeNull();
    cleanup();

    openViewer({ readOnly: true, features: ["stories", "messages"] });
    await settle();
    expect(screen.queryByLabelText(/^Reply to/)).toBeNull();
    cleanup();

    openViewer({ authors: [me.username], features: ["stories", "messages"] });
    await settle();
    expect(screen.queryByLabelText(/^Reply to/)).toBeNull();
  });

  it("shows the author who watched their story; Esc closes just the list", async () => {
    const { calls } = api({ viewers: [mert, lena] });
    openViewer({ authors: [me.username] });
    await settle();
    expect(screen.queryByRole("button", { name: /Seen by/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Seen by 3" }));
    await settle();
    const list = screen.getByRole("region", { name: "Viewers" });
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Viewers" })
    );
    expect(list.textContent).toContain("Mert Demir");
    expect(list.textContent).toContain("@lenaframes");
    expect(calls.map((call) => call.path)).toContain("/api/stories/s1/viewers");

    press("Escape", list);
    expect(screen.queryByRole("region", { name: "Viewers" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Stories" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Seen by 3" })
    );
  });

  it("shows Seen by only on your own stories", async () => {
    api();
    openViewer();
    await settle();
    expect(screen.queryByRole("button", { name: /Seen by/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Story options" })).toBeNull();
  });

  it("lets the author delete a story from the … menu", async () => {
    vi.useRealTimers();
    const { calls } = api();
    const { store } = openViewer({ authors: [me.username] });
    await screen.findByText("Building in public");

    fireEvent.click(screen.getByRole("button", { name: "Story options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByRole("region", { name: "Delete this story?" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(store.getState().ui.dialog).toBeNull());
    expect(
      calls.some(
        (call) => call.method === "DELETE" && call.path === "/api/stories/s1"
      )
    ).toBe(true);
    expect(store.getState().stories.trayVersion).toBe(1);
    expect(store.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Your story was deleted",
    ]);
  });

  it("waits for an account's stories before → or Next moves on", async () => {
    api({ listDelay: 400 });
    openViewer();
    await settle(50);
    press("ArrowRight");
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));

    await settle(400);
    expect(position()).toBe("Story 1 of 2 by Mert Demir, posted 2 hours ago");
  });

  it("doesn't close or go back while the account on screen is loading", async () => {
    api({ listDelay: 400 });
    const { store } = openViewer({ authors: [mert.username] });
    await settle(50);
    press("ArrowRight");
    expect(store.getState().ui.dialog).toBe("storyViewer");
    await settle(400);
    expect(position()).toMatch(/^Story 1 of 2 by Mert Demir/);
    cleanup();

    openViewer({ from: lena.username });
    await settle(50);
    press("ArrowLeft");
    await settle(400);
    expect(position()).toMatch(/^Story 1 of 1 by Lena Hoffmann/);
  });

  it("says when an account has nothing left to show", async () => {
    stubStoriesApi({});
    openViewer({ authors: [mert.username] });
    await settle();
    expect(
      screen.getByText("This story is no longer available", {
        selector: "p:not([aria-live])",
      })
    ).toBeTruthy();
    expect(position()).toBe("This story is no longer available");
  });
});
