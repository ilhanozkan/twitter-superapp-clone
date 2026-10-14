import { existsSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  expectStoresAgree,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { FakeSanityClient } from "../../test/fakeSanityClient";
import { textLength } from "../constants";
import { isSafeImageUrl } from "../imageUrl";
import { STORY_BACKGROUND_IDS, STORY_LIMITS } from "../superapp/stories";
import { IAuthor } from "../../types/User";
import { ConfigurationError, LimitExceededError } from "./errors";
import { createMemoryRepository, createMemoryState } from "./memory";
import { createSanityRepository } from "./sanity/repository";
import { seedToSanityDocuments } from "./sanity/seed";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Stories on both stores, from the superapp world's seed: six accounts with
// stories, the demo user has seen Lena's, and three people have seen the
// demo user's. Subjects start at 2026-10-08T12:00Z; seeded stories expire
// 24 hours later.

const HOUR = 60 * 60 * 1000;
const at = (minutesAgo: number) =>
  new Date(SUBJECT_NOW.getTime() - minutesAgo * 60_000).toISOString();
const SEED_EXPIRY = "2026-10-09T12:00:00.000Z";

const person = (
  username: string,
  fullname: string,
  image = `/avatars/${username}.svg`
): IAuthor => ({ username, fullname, image });

const demo = person(DEMO_USERNAME, "Ilhan Ozkan");
const sarah = person("sarahcodes", "Sarah Chen");
const marco = person("devmarco", "Marco Rossi");
const superapp = person("superapp", "Twitter SuperApp");

const text = (words: string) =>
  ({ type: "text", text: words, background: "slate" }) as const;

/** Moderates a story the way a Studio editor would (blocked = true). */
function block(subject: Subject, id: string) {
  if (subject.state) subject.state.stories.stories.get(id)!.blocked = true;
  else subject.client!.documents.find((d) => d._id === id)!.blocked = true;
}

/** Story ids as stored, whatever their state. */
function storedStories(subject: Subject): string[] {
  if (subject.state) return [...subject.state.stories.stories.keys()].sort();
  return subject
    .client!.documents.filter((d) => d._type === "story")
    .map((d) => d._id)
    .sort();
}

/** "<story>:<viewer>" for every stored view. */
function storedViews(subject: Subject): string[] {
  if (subject.state) {
    return [...subject.state.stories.views.values()]
      .map((view) => `${view.storyId}:${view.viewer.username.toLowerCase()}`)
      .sort();
  }
  return subject
    .client!.documents.filter((d) => d._type === "storyView")
    .map((d) => `${d.storyId}:${d.userKey}`)
    .sort();
}

const order = async (repo: Repository, viewer: string | null) =>
  (await repo.stories.listTray(viewer)).map((item) => item.author.username);

describe.each(subjects())("%s stories", (_name, create) => {
  let subject: Subject;
  let repo: Repository;

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  it("is on, and needs no token to be read", () => {
    expect(repo.featureStatus("stories")).toBe("on");
    expect(repo.features.stories).toBe(true);
    expect(repo.stories.implemented).toBe(true);
    expect(repo.stories.configured).toBe(true);
  });

  describe("the tray", () => {
    it("lists your story, then unseen accounts, then seen ones", async () => {
      expect(await repo.stories.listTray(DEMO_USERNAME)).toEqual([
        {
          author: demo,
          storyIds: ["seed-story07"],
          latestAt: at(360),
          hasUnseen: true,
          firstUnseenId: "seed-story07",
        },
        {
          author: superapp,
          storyIds: ["seed-story01"],
          latestAt: at(60),
          hasUnseen: true,
          firstUnseenId: "seed-story01",
        },
        {
          author: person("foodie_ankara", "Mert Demir"),
          storyIds: ["seed-story03", "seed-story04"],
          latestAt: at(120),
          hasUnseen: true,
          firstUnseenId: "seed-story03",
        },
        {
          author: person("kizilaykahve", "Kızılay Kahve"),
          storyIds: ["seed-story02"],
          latestAt: at(180),
          hasUnseen: true,
          firstUnseenId: "seed-story02",
        },
        {
          author: sarah,
          storyIds: ["seed-story06"],
          latestAt: at(1200),
          hasUnseen: true,
          firstUnseenId: "seed-story06",
        },
        {
          author: person("lenaframes", "Lena Hoffmann"),
          storyIds: ["seed-story05"],
          latestAt: at(480),
          hasUnseen: false,
          firstUnseenId: null,
        },
      ]);
    });

    it("is personal to the viewer, and has no own item for nobody", async () => {
      // Sarah has seen the demo user's story (seeded).
      expect(await order(repo, "SarahCodes")).toEqual([
        "sarahcodes",
        "superapp",
        "foodie_ankara",
        "kizilaykahve",
        "lenaframes",
        DEMO_USERNAME,
      ]);
      expect(await order(repo, null)).toEqual([
        "superapp",
        "foodie_ankara",
        "kizilaykahve",
        DEMO_USERNAME,
        "lenaframes",
        "sarahcodes",
      ]);
      expect(await order(repo, "ghost")).toEqual(await order(repo, null));
    });

    it("starts at the first unseen story and greys an account once all are seen", async () => {
      await repo.stories.markSeen(["seed-story03"], demo);
      const [, , mert] = await repo.stories.listTray(DEMO_USERNAME);
      expect(mert).toMatchObject({
        storyIds: ["seed-story03", "seed-story04"],
        hasUnseen: true,
        firstUnseenId: "seed-story04",
      });

      await repo.stories.markSeen(["seed-story04"], demo);
      expect(await order(repo, DEMO_USERNAME)).toEqual([
        DEMO_USERNAME,
        "superapp",
        "kizilaykahve",
        "sarahcodes",
        "foodie_ankara",
        "lenaframes",
      ]);
    });

    it("greys your own story once you have watched it", async () => {
      await repo.stories.markSeen(["seed-story07"], demo);
      const [mine] = await repo.stories.listTray(DEMO_USERNAME);
      expect(mine).toMatchObject({ hasUnseen: false, firstUnseenId: null });
    });
  });

  describe("reading stories", () => {
    it("reads a story with the viewer's seen state", async () => {
      expect(
        await repo.stories.getStory("seed-story05", DEMO_USERNAME)
      ).toEqual({
        id: "seed-story05",
        author: person("lenaframes", "Lena Hoffmann"),
        content: {
          type: "image",
          image: "/media/mountains.svg",
          alt: "Sunrise over mountain peaks",
          caption: "Dolomites, 5:42am",
        },
        createdAt: at(480),
        expiresAt: SEED_EXPIRY,
        viewer: { seen: true },
        views: null,
      });
      expect(
        (await repo.stories.getStory("seed-story05", "sarahcodes"))!.viewer
      ).toEqual({ seen: false });
      expect(
        (await repo.stories.getStory("seed-story05", null))!.viewer
      ).toEqual({ seen: false });
    });

    it("counts views on the author's own stories only, without the author", async () => {
      await repo.stories.markSeen(["seed-story07"], demo);

      const own = await repo.stories.getStory("seed-story07", "ILLLHANOZKAN");
      expect(own).toMatchObject({
        content: {
          type: "text",
          text: "Building the SuperApp in public 🚀",
          background: "green",
        },
        viewer: { seen: true },
        views: 3,
      });
      expect(
        (await repo.stories.getStory("seed-story07", "sarahcodes"))!.views
      ).toBeNull();
      expect(
        (await repo.stories.getStory("seed-story05", "lenaframes"))!.views
      ).toBe(1);
    });

    it("lists who saw a story, most recent first, never its author", async () => {
      await repo.stories.markSeen(["seed-story07"], demo);
      expect(await repo.stories.listViewers("seed-story07")).toEqual([
        superapp,
        marco,
        sarah,
      ]);
      expect(await repo.stories.listViewers("seed-story01")).toEqual([]);
      expect(await repo.stories.listViewers("ghost")).toEqual([]);
    });

    it("lists an author's stories oldest first, by any case", async () => {
      const stories = await repo.stories.listStories(
        "FOODIE_ANKARA",
        DEMO_USERNAME
      );
      expect(stories.map((story) => story.id)).toEqual([
        "seed-story03",
        "seed-story04",
      ]);
      expect(stories[1].content).toEqual({
        type: "text",
        text: "Lahmacun crawl tonight. Who's in? 🌯",
        background: "orange",
      });
      expect(await repo.stories.listStories("ghost", null)).toEqual([]);
    });

    it("treats unknown and malformed ids as missing", async () => {
      for (const id of ["ghost", "", "private.seed-story01", "drafts.x"]) {
        expect(await repo.stories.getStory(id, DEMO_USERNAME), id).toBeNull();
      }
    });
  });

  describe("posting", () => {
    it("posts a text story for exactly 24 hours", async () => {
      subject.clock.advance(HOUR);
      const now = subject.clock.now();

      const story = await repo.stories.createStory({
        author: demo,
        content: text("Shipping stories today ✨"),
      });
      expect(story).toEqual({
        id: expect.stringMatching(/^story-[A-Za-z0-9_-]+$/),
        author: demo,
        content: text("Shipping stories today ✨"),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * HOUR).toISOString(),
        viewer: { seen: false },
        views: 0,
      });
      expect(await repo.stories.getStory(story.id, DEMO_USERNAME)).toEqual(
        story
      );
      expect(
        (await repo.stories.listStories(DEMO_USERNAME, null)).map((s) => s.id)
      ).toEqual(["seed-story07", story.id]);
      expect((await repo.stories.listTray(DEMO_USERNAME))[0]).toMatchObject({
        storyIds: ["seed-story07", story.id],
        latestAt: now.toISOString(),
      });

      subject.clock.advance(24 * HOUR - 1);
      expect(await repo.stories.getStory(story.id, null)).not.toBeNull();

      subject.clock.advance(1);
      expect(await repo.stories.getStory(story.id, null)).toBeNull();
      expect(await repo.stories.listStories(DEMO_USERNAME, null)).toEqual([]);
      expect(await repo.stories.listTray(DEMO_USERNAME)).toEqual([]);
      expect(await repo.stories.listViewers(story.id)).toEqual([]);
    });

    it("posts an image story with alt text and an optional caption", async () => {
      const story = await repo.stories.createStory({
        author: sarah,
        content: {
          type: "image",
          image: "https://example.com/sunset.jpg",
          alt: "A sunset over the bay",
          caption: null,
        },
      });
      expect(await repo.stories.getStory(story.id, "sarahcodes")).toMatchObject(
        {
          content: {
            type: "image",
            image: "https://example.com/sunset.jpg",
            alt: "A sunset over the bay",
            caption: null,
          },
          views: 0,
        }
      );
    });

    it("expires the seeded stories 24 hours after the seed", async () => {
      subject.clock.advance(24 * HOUR - 1);
      expect(await order(repo, DEMO_USERNAME)).toHaveLength(6);
      subject.clock.advance(1);
      expect(await repo.stories.listTray(DEMO_USERNAME)).toEqual([]);
      expect(await repo.stories.getStory("seed-story07", null)).toBeNull();
    });

    it("allows 10 active stories per author", async () => {
      // The demo user has one seeded story.
      const posted = [];
      for (let i = 1; i < STORY_LIMITS.activePerAuthor; i++) {
        posted.push(
          await repo.stories.createStory({
            author: demo,
            content: text(`${i}`),
          })
        );
      }
      const eleventh = repo.stories.createStory({
        author: demo,
        content: text("one too many"),
      });
      await expect(eleventh).rejects.toThrow(LimitExceededError);
      await expect(eleventh).rejects.toThrow(
        "You can have at most 10 active stories"
      );
      // Others have their own allowance.
      await expect(
        repo.stories.createStory({ author: sarah, content: text("mine") })
      ).resolves.toMatchObject({ author: sarah });

      // Deleting, blocking or expiry makes room.
      expect(await repo.stories.deleteStory(posted[0].id)).toBe(true);
      await repo.stories.createStory({ author: demo, content: text("again") });
      block(subject, posted[1].id);
      await repo.stories.createStory({ author: demo, content: text("more") });
      await expect(
        repo.stories.createStory({ author: demo, content: text("full") })
      ).rejects.toThrow(LimitExceededError);

      subject.clock.advance(24 * HOUR);
      await expect(
        repo.stories.createStory({ author: demo, content: text("next day") })
      ).resolves.toMatchObject({ author: demo });
    });

    it("deletes the author's expired stories and their views on the next post", async () => {
      const first = await repo.stories.createStory({
        author: demo,
        content: text("yesterday"),
      });
      await repo.stories.markSeen([first.id, "seed-story07"], sarah);
      expect(storedViews(subject)).toContain(`${first.id}:sarahcodes`);

      subject.clock.advance(24 * HOUR);
      // Reading never deletes anything (GET never writes).
      await repo.stories.listTray(DEMO_USERNAME);
      expect(storedStories(subject)).toContain(first.id);

      const next = await repo.stories.createStory({
        author: demo,
        content: text("today"),
      });
      const stored = storedStories(subject);
      expect(stored).toContain(next.id);
      expect(stored).not.toContain(first.id);
      expect(stored).not.toContain("seed-story07");
      // Other authors' expired stories wait for their own next post.
      expect(stored).toContain("seed-story01");
      expect(
        storedViews(subject).filter(
          (view) =>
            view.startsWith(`${first.id}:`) || view.startsWith("seed-story07:")
        )
      ).toEqual([]);
      expect(storedViews(subject)).toContain(`seed-story05:${DEMO_USERNAME}`);
    });
  });

  describe("seen state", () => {
    it("is idempotent, even when the same views race", async () => {
      // On Sanity, every batch reads before any of them writes.
      if (subject.client) {
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all([
        repo.stories.markSeen(["seed-story01", "seed-story02"], sarah),
        repo.stories.markSeen(["seed-story01"], sarah),
        repo.stories.markSeen(
          ["seed-story02", "seed-story01", "seed-story01"],
          sarah
        ),
        repo.stories.markSeen(["seed-story01"], marco),
      ]);
      await repo.stories.markSeen(["seed-story01"], sarah);

      expect(
        storedViews(subject).filter((view) => /^seed-story0[12]:/.test(view))
      ).toEqual([
        "seed-story01:devmarco",
        "seed-story01:sarahcodes",
        "seed-story02:sarahcodes",
      ]);
      expect(
        (await repo.stories.listViewers("seed-story01")).map(
          (viewer) => viewer.username
        )
      ).toEqual(["devmarco", "sarahcodes"]);
      expect(
        (await repo.stories.getStory("seed-story01", "superapp"))!.views
      ).toBe(2);
    });

    it("keeps the first view's time", async () => {
      await repo.stories.markSeen(["seed-story01"], sarah);
      subject.clock.advance(60_000);
      await repo.stories.markSeen(["seed-story01"], marco);
      subject.clock.advance(60_000);
      await repo.stories.markSeen(["seed-story01"], sarah);
      expect(
        (await repo.stories.listViewers("seed-story01")).map(
          (viewer) => viewer.username
        )
      ).toEqual(["devmarco", "sarahcodes"]);
    });

    it("ignores unknown, expired and blocked stories", async () => {
      const before = storedViews(subject);
      block(subject, "seed-story01");
      await repo.stories.markSeen(
        ["ghost", "private.seed-story02", "seed-story01"],
        sarah
      );
      expect(storedViews(subject)).toEqual(before);

      subject.clock.advance(24 * HOUR);
      await repo.stories.markSeen(["seed-story02"], sarah);
      expect(storedViews(subject)).toEqual(before);
    });
  });

  describe("moderation and deletion", () => {
    it("hides blocked stories everywhere", async () => {
      block(subject, "seed-story07");

      expect(
        await repo.stories.getStory("seed-story07", DEMO_USERNAME)
      ).toBeNull();
      expect(
        await repo.stories.listStories(DEMO_USERNAME, DEMO_USERNAME)
      ).toEqual([]);
      expect(await repo.stories.listViewers("seed-story07")).toEqual([]);
      expect(await order(repo, DEMO_USERNAME)).not.toContain(DEMO_USERNAME);

      // Blocking one of two leaves the other.
      block(subject, "seed-story03");
      const mert = (await repo.stories.listTray(DEMO_USERNAME)).find(
        (item) => item.author.username === "foodie_ankara"
      );
      expect(mert).toMatchObject({
        storyIds: ["seed-story04"],
        firstUnseenId: "seed-story04",
      });
    });

    it("deletes a story with its views", async () => {
      expect(await repo.stories.deleteStory("seed-story07")).toBe(true);
      expect(await repo.stories.deleteStory("seed-story07")).toBe(false);
      expect(await repo.stories.deleteStory("ghost")).toBe(false);

      expect(
        await repo.stories.getStory("seed-story07", DEMO_USERNAME)
      ).toBeNull();
      expect(storedStories(subject)).not.toContain("seed-story07");
      expect(
        storedViews(subject).filter((view) => view.startsWith("seed-story07:"))
      ).toEqual([]);
      expect(await order(repo, DEMO_USERNAME)).not.toContain(DEMO_USERNAME);
    });
  });

  it("has no notifications or live activity", async () => {
    expect(await repo.stories.notifications(DEMO_USERNAME, 10)).toEqual([]);
    expect(await repo.stories.liveActivity(DEMO_USERNAME)).toEqual([]);
  });
});

describe("stories on Sanity", () => {
  let subject: Subject;
  let client: FakeSanityClient;

  beforeEach(() => {
    subject = subjects()[1][1]();
    client = subject.client!;
  });

  it("posts in one transaction that also deletes the author's expired stories", async () => {
    await subject.repo.stories.markSeen(["seed-story07"], sarah);
    subject.clock.advance(24 * HOUR);
    const before = client.mutationLog.length;

    const story = await subject.repo.stories.createStory({
      author: demo,
      content: text("one write"),
    });
    expect(client.mutationLog.length).toBe(before + 1);
    expect(client.mutationLog.at(-1)).toEqual(
      expect.arrayContaining([
        { create: expect.objectContaining({ _id: story.id, _type: "story" }) },
        { delete: { id: "seed-story07" } },
        {
          delete: {
            id: `private.storyview-seed-story07-sarahcodes`,
          },
        },
      ])
    );
    expect(await client.getDocument(story.id)).toMatchObject({
      _type: "story",
      authorKey: DEMO_USERNAME,
      contentType: "text",
      text: "one write",
      background: "slate",
      blocked: false,
    });
  });

  it("marks a batch seen in one transaction of private, idempotent views", async () => {
    const before = client.mutationLog.length;
    await subject.repo.stories.markSeen(
      ["seed-story01", "seed-story02", "seed-story05"],
      demo
    );
    expect(client.mutationLog.length).toBe(before + 1);
    // Lena's story was already seen, so only two views are written.
    expect(client.mutationLog.at(-1)).toEqual([
      {
        createIfNotExists: expect.objectContaining({
          _id: `private.storyview-seed-story01-${DEMO_USERNAME}`,
          _type: "storyView",
          story: { _type: "reference", _ref: "seed-story01", _weak: true },
          userKey: DEMO_USERNAME,
        }),
      },
      {
        createIfNotExists: expect.objectContaining({
          _id: `private.storyview-seed-story02-${DEMO_USERNAME}`,
        }),
      },
    ]);

    // Nothing new to record: nothing written.
    await subject.repo.stories.markSeen(["seed-story01", "ghost"], demo);
    expect(client.mutationLog.length).toBe(before + 1);
  });

  it("is readable without a token, which hides views and refuses writes", async () => {
    client.anonymous = true;
    const repo = createSanityRepository(client, {
      canWrite: false,
      superappClient: client,
      now: subject.clock.now,
    });

    expect(repo.featureStatus("stories")).toBe("on");
    const tray = await repo.stories.listTray(DEMO_USERNAME);
    expect(tray).toHaveLength(6);
    // Views are private documents: an anonymous reader sees none.
    expect(tray.every((item) => item.hasUnseen)).toBe(true);
    expect(
      (await repo.stories.getStory("seed-story07", DEMO_USERNAME))!.views
    ).toBe(0);

    for (const write of [
      () => repo.stories.createStory({ author: demo, content: text("x") }),
      () => repo.stories.markSeen(["seed-story01"], demo),
      () => repo.stories.deleteStory("seed-story07"),
    ]) {
      await expect(write()).rejects.toThrow(ConfigurationError);
    }
  });
});

describe("memory caps", () => {
  const memory = (limits: { stories?: number; storyViews?: number }) => {
    const state = createMemoryState(createSeedData(SUBJECT_NOW));
    let counter = 0;
    let now = SUBJECT_NOW.getTime();
    const repo = createMemoryRepository(state, {
      now: () => new Date(now),
      generateId: () => `new-${++counter}`,
      limits,
    });
    return { state, repo, tick: () => (now += 1000) };
  };

  it("drops expired stories first, then the oldest", async () => {
    const { state, repo, tick } = memory({ stories: 8 });
    // The newest seeded story, expired by hand, goes before older live ones.
    state.stories.stories.get("seed-story01")!.expiresAt = at(1);

    tick();
    await repo.stories.createStory({ author: marco, content: text("a") });
    expect(state.stories.stories.size).toBe(8);
    tick();
    await repo.stories.createStory({ author: marco, content: text("b") });
    expect(state.stories.stories.has("seed-story01")).toBe(false);
    expect(state.stories.stories.size).toBe(8);

    tick();
    await repo.stories.createStory({ author: marco, content: text("c") });
    // Then Sarah's, the oldest of the rest.
    expect(state.stories.stories.has("seed-story06")).toBe(false);
    expect(state.stories.stories.size).toBe(8);
  });

  it("drops the oldest views", async () => {
    const { state, repo } = memory({ storyViews: 5 });
    await repo.stories.markSeen(["seed-story01", "seed-story02"], sarah);

    expect(state.stories.views.size).toBe(5);
    expect(
      [...state.stories.views.values()].map(
        (view) => `${view.storyId}:${view.viewer.username}`
      )
    ).toEqual([
      "seed-story07:sarahcodes",
      "seed-story07:devmarco",
      "seed-story07:superapp",
      "seed-story01:sarahcodes",
      "seed-story02:sarahcodes",
    ]);
  });
});

describe("the stories seed", () => {
  const documents = seedToSanityDocuments(
    createSeedData(SUBJECT_NOW, { world: "superapp" })
  );
  const stories = documents.filter((d) => d._type === "story");
  const views = documents.filter((d) => d._type === "storyView");

  it("passes the Studio's rules and points at art on disk", () => {
    expect(stories).toHaveLength(7);
    for (const story of stories) {
      expect(story._id).toMatch(/^seed-story\d\d$/);
      expect(story.authorKey).toBe(
        String((story.author as IAuthor).username).toLowerCase()
      );
      expect(story.expiresAt).toBe(SEED_EXPIRY);
      if (story.contentType === "text") {
        expect(STORY_BACKGROUND_IDS).toContain(story.background);
        expect(textLength(String(story.text))).toBeLessThanOrEqual(
          STORY_LIMITS.textMax
        );
      } else {
        const image = String(story.image);
        expect(isSafeImageUrl(image)).toBe(true);
        expect(existsSync(path.join(__dirname, "../../public", image))).toBe(
          true
        );
        expect(textLength(String(story.imageAlt))).toBeGreaterThan(0);
        expect(textLength(String(story.imageAlt))).toBeLessThanOrEqual(
          STORY_LIMITS.altMax
        );
        expect(textLength(String(story.caption ?? ""))).toBeLessThanOrEqual(
          STORY_LIMITS.captionMax
        );
      }
    }
  });

  it("keeps views private and pointing at seeded stories", () => {
    const ids = new Set(stories.map((story) => story._id));
    expect(views).toHaveLength(4);
    for (const view of views) {
      expect(view._id).toMatch(/^private\.storyview-/);
      expect(ids.has(String(view.storyId))).toBe(true);
    }
  });
});

describe("both stores agree", () => {
  it("on trays, stories and viewers after the same writes", async () => {
    await expectStoresAgree(
      async (repo) => ({
        demo: await repo.stories.listTray(DEMO_USERNAME),
        sarah: await repo.stories.listTray("sarahcodes"),
        nobody: await repo.stories.listTray(null),
        mine: await repo.stories.listStories(DEMO_USERNAME, DEMO_USERNAME),
        mert: await repo.stories.listStories("foodie_ankara", "sarahcodes"),
        story: await repo.stories.getStory("story-new-1", "devmarco"),
        viewers: await repo.stories.listViewers("seed-story07"),
        fresh: await repo.stories.listViewers("story-new-1"),
      }),
      {
        prepare: async (subject) => {
          const { stories } = subject.repo;
          subject.clock.advance(HOUR);
          await stories.createStory({ author: demo, content: text("first") });
          subject.clock.advance(60_000);
          await stories.createStory({
            author: demo,
            content: {
              type: "image",
              image: "/media/skyline.svg",
              alt: "The Ankara skyline at dusk",
              caption: "Home",
            },
          });
          await stories.markSeen(["story-new-1", "seed-story04"], sarah);
          subject.clock.advance(60_000);
          await stories.markSeen(["story-new-1", "seed-story07"], marco);
          await stories.markSeen(["story-new-2"], demo);
          block(subject, "seed-story02");
          await stories.deleteStory("seed-story06");
        },
      }
    );
  });
});
