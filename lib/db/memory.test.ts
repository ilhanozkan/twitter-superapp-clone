import { describe, expect, it } from "vitest";

import { createMemoryRepository, createMemoryState } from "./memory";
import { createSeedData } from "./seed";

const author = { username: "flooder", fullname: "Flooder", image: null };
// The core world: the caps below are counted against its 21 seed tweets.
const coreSeed = () => createSeedData(new Date(), { world: "core" });

describe("memory repository limits", () => {
  it("keeps at most `limits.tweets` tweets, dropping the oldest with their data", async () => {
    let counter = 0;
    const repo = createMemoryRepository(createMemoryState(coreSeed()), {
      generateId: () => `new-${++counter}`,
      limits: { tweets: 22, replies: 1000 },
    });

    for (let i = 0; i < 5; i++)
      await repo.createTweet({ text: `post ${i}`, author });

    const { items } = await repo.listTweets({ limit: 50 });
    // 21 seed tweets (one moderated) + 5 new, capped at 22: the 4 oldest seed tweets go.
    expect(items).toHaveLength(21);
    expect(items[0].id).toBe("new-5");
    expect(await repo.getTweet("seed-t20")).toBeNull();
    expect(await repo.listReplies("seed-t19")).toEqual([]);
  });

  it("keeps at most `limits.replies` replies, dropping the oldest", async () => {
    const repo = createMemoryRepository(createMemoryState(coreSeed()), {
      limits: { tweets: 1000, replies: 3 },
    });

    await repo.createReply({ tweetId: "seed-t01", text: "latest", author });

    expect((await repo.listReplies("seed-t01")).map((r) => r.text)).toEqual([
      "latest",
    ]);
  });
});
