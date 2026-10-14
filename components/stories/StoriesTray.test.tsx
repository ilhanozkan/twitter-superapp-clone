// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import {
  SEEN_STORAGE_KEY,
  storySeen,
  trayChanged,
} from "../../slices/storiesSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IStoryTrayItem } from "../../types/Story";
import StoriesTray from "./StoriesTray";
import {
  lena,
  me,
  mert,
  story,
  stubStoriesApi,
  text,
  trayItem,
} from "./testing";
import { parseViewerArgs } from "./viewerArgs";

let items: IStoryTrayItem[];

beforeEach(() => {
  window.sessionStorage.clear();
  items = [
    trayItem(me, [story("s1", me, text("Mine"), { views: 3 })]),
    trayItem(mert, [
      story("m1", mert, text("One")),
      story("m2", mert, text("Two")),
    ]),
    trayItem(lena, [story("l1", lena, text("Seen"), { seen: true })]),
  ];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTray(
  tray: IStoryTrayItem[] = items,
  { readOnly = false, stories = true } = {}
) {
  return renderWithStore(<StoriesTray items={tray} />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly,
        features: stories ? featuresWith("stories") : featuresWith(),
      }),
    },
  });
}

const tray = () => screen.getByRole("region", { name: "Stories" });

/** A button's accessible name: its label, or its text without hidden parts (the avatar's initials). */
function accessibleName(button: HTMLElement): string {
  const label = button.getAttribute("aria-label");
  if (label) return label;
  const copy = button.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll("[aria-hidden='true']")
    .forEach((hidden) => hidden.remove());
  return copy.textContent ?? "";
}

const names = () => within(tray()).getAllByRole("button").map(accessibleName);

describe("StoriesTray", () => {
  it("lists Your story with a separate +, then accounts by name with their new count", () => {
    renderTray();
    expect(within(tray()).getByRole("list")).toBeTruthy();
    expect(names()).toEqual([
      "Your story",
      "Add to your story",
      "Mert Demir's stories, 2 new",
      "Lena Hoffmann's stories",
    ]);
    const ring = (name: string) =>
      screen.getByRole("button", { name }).querySelector("[data-ring]");
    expect(ring("Mert Demir's stories, 2 new")?.getAttribute("data-ring")).toBe(
      "unseen"
    );
    expect(ring("Lena Hoffmann's stories")?.getAttribute("data-ring")).toBe(
      "seen"
    );
  });

  it("shows only an Add to your story item when nothing is posted", () => {
    renderTray([]);
    expect(names()).toEqual(["Add to your story"]);
    expect(within(tray()).getByText("Your story")).toBeTruthy();
  });

  it("opens the composer from the +", () => {
    const { store } = renderTray();
    fireEvent.click(screen.getByRole("button", { name: "Add to your story" }));
    expect(store.getState().ui.dialog).toBe("storyComposer");
  });

  it("opens the viewer on an account's first unseen story, then the rest of the tray", () => {
    items[1] = trayItem(mert, [
      story("m1", mert, text("One"), { seen: true }),
      story("m2", mert, text("Two")),
    ]);
    const { store } = renderTray();
    fireEvent.click(
      screen.getByRole("button", { name: "Mert Demir's stories, 1 new" })
    );
    expect(store.getState().ui.dialog).toBe("storyViewer");
    expect(parseViewerArgs(store.getState().ui.dialogArgs)).toEqual({
      authors: ["foodie_ankara", "lenaframes"],
      start: 0,
      story: "m2",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Lena Hoffmann's stories" })
    );
    expect(parseViewerArgs(store.getState().ui.dialogArgs)).toEqual({
      authors: ["foodie_ankara", "lenaframes"],
      start: 1,
      story: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Your story" }));
    expect(parseViewerArgs(store.getState().ui.dialogArgs)).toEqual({
      authors: ["illlhanozkan"],
      start: 0,
      story: "s1",
    });
  });

  it("turns a ring grey once its stories are watched, without moving it", () => {
    const { store } = renderTray();
    act(() => {
      store.dispatch(storySeen("m1"));
    });
    expect(names()[2]).toBe("Mert Demir's stories, 1 new");
    act(() => {
      store.dispatch(storySeen("m2"));
    });
    expect(names()).toEqual([
      "Your story",
      "Add to your story",
      "Mert Demir's stories",
      "Lena Hoffmann's stories",
    ]);
    expect(
      screen
        .getByRole("button", { name: "Mert Demir's stories" })
        .querySelector("[data-ring]")
        ?.getAttribute("data-ring")
    ).toBe("seen");
  });

  it("reloads itself after one of your stories is posted or deleted", async () => {
    const fresh = [
      trayItem(me, [
        story("s1", me, text("Mine")),
        story("s2", me, text("New one")),
      ]),
    ];
    const { calls } = stubStoriesApi({}, { tray: fresh });
    const { store } = renderTray();
    expect(calls).toEqual([]);

    act(() => {
      store.dispatch(trayChanged());
    });
    await vi.waitFor(() =>
      expect(names()).toEqual(["Your story", "Add to your story"])
    );
    expect(calls.map((call) => call.path)).toEqual(["/api/stories/tray"]);
  });

  describe("READ_ONLY", () => {
    it("has no +", () => {
      renderTray(items, { readOnly: true });
      expect(names()).toEqual([
        "Your story",
        "Mert Demir's stories, 2 new",
        "Lena Hoffmann's stories",
      ]);
    });

    it("is hidden when there are no stories", () => {
      renderTray([], { readOnly: true });
      expect(screen.queryByRole("region", { name: "Stories" })).toBeNull();
    });

    it("keeps stories watched in this tab grey after a reload (sessionStorage)", () => {
      window.sessionStorage.setItem(
        SEEN_STORAGE_KEY,
        JSON.stringify(["m1", "m2"])
      );
      renderTray(items, { readOnly: true });
      expect(names()).toContain("Mert Demir's stories");
    });

    it("ignores what sessionStorage holds when the demo is writable", () => {
      window.sessionStorage.setItem(
        SEEN_STORAGE_KEY,
        JSON.stringify(["m1", "m2"])
      );
      renderTray();
      expect(names()).toContain("Mert Demir's stories, 2 new");
    });
  });

  it("renders nothing while Stories is off", () => {
    renderTray(items, { stories: false });
    expect(screen.queryByRole("region", { name: "Stories" })).toBeNull();
  });
});
