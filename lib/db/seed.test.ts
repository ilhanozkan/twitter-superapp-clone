import { describe, expect, it } from "vitest";

import { TWEET_MAX_LENGTH, textLength, USERNAME_PATTERN } from "../constants";
import { seedToSanityDocuments } from "./sanity/seed";
import { createSeedData, DEMO_USERNAME } from "./seed";

const NOW = new Date("2026-10-08T12:00:00.000Z");

describe("seed data", () => {
  const seed = createSeedData(NOW);
  const usernames = new Set(seed.users.map((user) => user.username));
  const tweetIds = new Set(seed.tweets.map((tweet) => tweet.id));

  it("has unique, valid usernames including the demo account", () => {
    expect(usernames.size).toBe(seed.users.length);
    expect(usernames.has(DEMO_USERNAME)).toBe(true);
    for (const username of usernames)
      expect(username).toMatch(USERNAME_PATTERN);
  });

  it("only references users and tweets that exist", () => {
    for (const tweet of seed.tweets)
      expect(usernames.has(tweet.author)).toBe(true);
    for (const reply of seed.replies) {
      expect(usernames.has(reply.author)).toBe(true);
      expect(tweetIds.has(reply.tweetId)).toBe(true);
    }
    for (const reaction of seed.reactions) {
      expect(usernames.has(reaction.username)).toBe(true);
      expect(tweetIds.has(reaction.tweetId)).toBe(true);
    }
  });

  it("respects the tweet length limit", () => {
    for (const text of [...seed.tweets, ...seed.replies].map(
      (item) => item.text
    )) {
      expect(textLength(text)).toBeLessThanOrEqual(TWEET_MAX_LENGTH);
    }
  });

  it("is dated in the past relative to now, with reactions after their tweet", () => {
    const tweetTime = new Map(
      seed.tweets.map((t) => [t.id, Date.parse(t.createdAt)])
    );
    for (const item of [...seed.tweets, ...seed.replies, ...seed.reactions]) {
      expect(Date.parse(item.createdAt)).toBeLessThan(NOW.getTime());
    }
    for (const item of [...seed.replies, ...seed.reactions]) {
      expect(Date.parse(item.createdAt)).toBeGreaterThanOrEqual(
        tweetTime.get(item.tweetId)!
      );
    }
  });

  it("converts to Sanity documents with unique ids", () => {
    const documents = seedToSanityDocuments(seed);
    expect(new Set(documents.map((d) => d._id)).size).toBe(documents.length);
    for (const document of documents) {
      expect(document._id).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
      expect(Object.values(document)).not.toContain(null);
    }
  });
});
