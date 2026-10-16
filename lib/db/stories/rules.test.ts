import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "../../superapp/contrast";
import { LIMITS } from "../../superapp/limits";
import { canDeleteStory, canViewViewers } from "../../superapp/policy/stories";
import {
  assertCanPostStory,
  buildTray,
  compareStories,
  isStoryBackground,
  isStoryExpired,
  isStoryVisible,
  STORY_BACKGROUND_IDS,
  STORY_BACKGROUNDS,
  STORY_LIMITS,
  storyBackgroundColor,
  storyExpiresAt,
  TRAY_MAX_ACCOUNTS,
} from "../../superapp/stories";
import { IStory, StoryBackground } from "../../../types/Story";
import { LimitExceededError } from "../errors";
import { storyViewKey, StoryRecord, toStory } from "./records";

// The pure rules behind stories (lib/superapp/stories.ts, its policy and the
// shared records), which both stores call.

// Every member of the union: the compiler fails here when one is added.
const BACKGROUNDS: Record<StoryBackground, true> = {
  blue: true,
  purple: true,
  green: true,
  orange: true,
  pink: true,
  slate: true,
};

const author = (username: string) => ({
  username,
  fullname: username,
  image: null,
});

function story(
  id: string,
  username: string,
  createdAt: string,
  seen = false
): IStory {
  return {
    id,
    author: author(username),
    content: { type: "text", text: id, background: "blue" },
    createdAt,
    expiresAt: storyExpiresAt(new Date(createdAt)),
    viewer: { seen },
    views: null,
  };
}

describe("the story palette", () => {
  it("has the six backgrounds of the composer, in order", () => {
    expect(STORY_BACKGROUNDS).toEqual([
      { id: "blue", label: "Blue", color: "#1570c2" },
      { id: "purple", label: "Purple", color: "#6d28d9" },
      { id: "green", label: "Green", color: "#047857" },
      { id: "orange", label: "Orange", color: "#b45309" },
      { id: "pink", label: "Pink", color: "#be185d" },
      { id: "slate", label: "Slate", color: "#334155" },
    ]);
    expect([...STORY_BACKGROUND_IDS].sort()).toEqual(
      Object.keys(BACKGROUNDS).sort()
    );
    expect(storyBackgroundColor("orange")).toBe("#b45309");
    expect(isStoryBackground("pink")).toBe(true);
    expect(isStoryBackground("red")).toBe(false);
    expect(isStoryBackground(null)).toBe(false);
  });

  it.each(STORY_BACKGROUNDS.map((background) => [background.id, background]))(
    "keeps white text at least 5:1 on %s",
    (_id, { color }) => {
      expect(contrastRatio("#ffffff", color)).toBeGreaterThanOrEqual(5);
    }
  );

  it("is the list the Studio offers", () => {
    // The Studio is a separate package the app's tests can't import, so its
    // schema file is read as text.
    const source = readFileSync(
      path.join(__dirname, "../../../sanity/schemaTypes/stories.ts"),
      "utf8"
    );
    const start = source.indexOf("STORY_BACKGROUNDS");
    const list = source.slice(start, source.indexOf("];", start));
    expect(
      [...list.matchAll(/value: "([a-z]+)", title: "([A-Za-z]+)"/g)].map(
        ([, value, title]) => ({ value, title })
      )
    ).toEqual(
      STORY_BACKGROUNDS.map(({ id, label }) => ({ value: id, title: label }))
    );
  });
});

describe("expiry", () => {
  const posted = new Date("2026-10-08T12:00:00.000Z");

  it("expires exactly 24 hours after posting", () => {
    expect(storyExpiresAt(posted)).toBe("2026-10-09T12:00:00.000Z");

    const record = { expiresAt: storyExpiresAt(posted), blocked: false };
    const justBefore = new Date("2026-10-09T11:59:59.999Z");
    const atExpiry = new Date("2026-10-09T12:00:00.000Z");
    expect(isStoryExpired(record, justBefore)).toBe(false);
    expect(isStoryVisible(record, justBefore)).toBe(true);
    expect(isStoryExpired(record, atExpiry)).toBe(true);
    expect(isStoryVisible(record, atExpiry)).toBe(false);
  });

  it("hides blocked stories however fresh", () => {
    expect(
      isStoryVisible(
        { expiresAt: storyExpiresAt(posted), blocked: true },
        posted
      )
    ).toBe(false);
  });
});

describe("limits", () => {
  it("are the shared limits", () => {
    expect(STORY_LIMITS).toEqual({
      activePerAuthor: 10,
      textMax: 200,
      altMax: 420,
      captionMax: 100,
    });
    expect(STORY_LIMITS).toBe(LIMITS.stories);
  });

  it("allows up to 10 active stories per author", () => {
    expect(() => assertCanPostStory(0)).not.toThrow();
    expect(() => assertCanPostStory(9)).not.toThrow();
    expect(() => assertCanPostStory(10)).toThrow(LimitExceededError);
    expect(() => assertCanPostStory(10)).toThrow(
      "You can have at most 10 active stories"
    );
  });
});

describe("the tray", () => {
  const at = (minutesAgo: number) =>
    new Date(
      Date.parse("2026-10-08T12:00:00Z") - minutesAgo * 60_000
    ).toISOString();

  it("orders your story, then unseen, then seen, each newest first", () => {
    const stories = [
      story("lena-1", "lenaframes", at(10), true),
      story("mert-2", "foodie_ankara", at(120)),
      story("mine", "Me", at(500), true),
      story("mert-1", "foodie_ankara", at(300), true),
      story("sarah-1", "sarahcodes", at(60)),
      story("old-seen", "devmarco", at(900), true),
    ];

    const tray = buildTray(stories, "me");
    expect(tray.map((item) => item.author.username)).toEqual([
      "Me",
      "sarahcodes",
      "foodie_ankara",
      "lenaframes",
      "devmarco",
    ]);
    expect(tray[0]).toEqual({
      author: author("Me"),
      storyIds: ["mine"],
      latestAt: at(500),
      hasUnseen: false,
      firstUnseenId: null,
      unseenIds: [],
    });
    // Oldest first, starting at the first one not seen yet.
    expect(tray[2]).toEqual({
      author: author("foodie_ankara"),
      storyIds: ["mert-1", "mert-2"],
      latestAt: at(120),
      hasUnseen: true,
      firstUnseenId: "mert-2",
      unseenIds: ["mert-2"],
    });
  });

  it("lists only the unseen stories when a later one was seen first", () => {
    const [mert] = buildTray(
      [
        story("mert-1", "foodie_ankara", at(300)),
        story("mert-2", "foodie_ankara", at(120), true),
        story("mert-3", "foodie_ankara", at(60)),
      ],
      "me"
    );
    expect(mert).toMatchObject({
      storyIds: ["mert-1", "mert-2", "mert-3"],
      hasUnseen: true,
      firstUnseenId: "mert-1",
      unseenIds: ["mert-1", "mert-3"],
    });
  });

  it("has no own item for someone without stories, or for nobody", () => {
    const stories = [
      story("a", "sarahcodes", at(5)),
      story("b", "devmarco", at(5)),
    ];
    // Ties on time fall back to the username.
    expect(
      buildTray(stories, "illlhanozkan").map((item) => item.author.username)
    ).toEqual(["devmarco", "sarahcodes"]);
    expect(buildTray(stories, null)).toHaveLength(2);
    expect(buildTray([], "illlhanozkan")).toEqual([]);
  });

  it("keeps the newest author snapshot and caps the accounts", () => {
    const renamed = {
      ...story("new", "sarahcodes", at(1)),
      author: { ...author("sarahcodes"), fullname: "Sarah C." },
    };
    const [item] = buildTray(
      [renamed, story("old", "sarahcodes", at(9))],
      null
    );
    expect(item.author.fullname).toBe("Sarah C.");

    const many = Array.from({ length: TRAY_MAX_ACCOUNTS + 5 }, (_, i) =>
      story(`s${i}`, `user${i}`, at(i))
    );
    expect(buildTray(many, null)).toHaveLength(TRAY_MAX_ACCOUNTS);
  });

  it("plays stories oldest first, ties by id", () => {
    const sorted = [
      story("b", "x", at(1)),
      story("c", "x", at(2)),
      story("a", "x", at(1)),
    ].sort(compareStories);
    expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});

describe("records", () => {
  const record: StoryRecord = {
    id: "seed-story07",
    author: author("illlhanozkan"),
    content: {
      type: "image",
      image: "/media/coffee.svg",
      alt: "Coffee",
      caption: null,
    },
    createdAt: "2026-10-08T06:00:00.000Z",
    expiresAt: "2026-10-09T06:00:00.000Z",
    blocked: false,
  };

  it("keys a view by story and lower-case viewer", () => {
    expect(storyViewKey("seed-story07", "SarahCodes")).toBe(
      "storyview-seed-story07-sarahcodes"
    );
  });

  it("shows the view count to the author only", () => {
    expect(
      toStory(record, "ILLLHANOZKAN", { seen: true, views: 3 })
    ).toMatchObject({ viewer: { seen: true }, views: 3 });
    expect(
      toStory(record, "illlhanozkan", { seen: false, views: null }).views
    ).toBe(0);
    expect(
      toStory(record, "sarahcodes", { seen: false, views: 3 }).views
    ).toBeNull();
    expect(toStory(record, null, { seen: false, views: 3 }).views).toBeNull();
  });

  it("copies the content, never sharing it with the store", () => {
    const dto = toStory(record, null, { seen: false, views: null });
    expect(dto.content).toEqual(record.content);
    expect(dto.content).not.toBe(record.content);
    expect(dto.author).not.toBe(record.author);
  });
});

describe("policy", () => {
  const mine = { author: author("illlhanozkan") };

  it("lets only the author see viewers and delete (any case)", () => {
    expect(canViewViewers("IllLhanOzkan", mine)).toBe(true);
    expect(canDeleteStory("illlhanozkan", mine)).toBe(true);
    expect(canViewViewers("sarahcodes", mine)).toBe(false);
    expect(canDeleteStory("sarahcodes", mine)).toBe(false);
  });
});
