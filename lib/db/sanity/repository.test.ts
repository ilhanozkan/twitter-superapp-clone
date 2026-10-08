import { describe, expect, it, vi } from "vitest";

import { ConfigurationError } from "../errors";
import { tweetListQuery, TWEET_FILTER } from "./queries";
import {
  createSanityRepository,
  reactionDocumentId,
  SanityClientLike,
} from "./repository";

const author = { username: "Someone", fullname: "Some One", image: null };

function stubClient(
  overrides: Partial<SanityClientLike> = {}
): SanityClientLike {
  return {
    fetch: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    createIfNotExists: vi.fn(),
    delete: vi.fn(),
    mutate: vi.fn(),
    ...overrides,
  };
}

describe("Sanity repository", () => {
  it("is read-only without a token", async () => {
    const client = stubClient();
    const repo = createSanityRepository(client, { canWrite: false });

    await expect(
      repo.createTweet({ text: "hi", author })
    ).rejects.toBeInstanceOf(ConfigurationError);
    await expect(repo.deleteTweet("t1")).rejects.toBeInstanceOf(
      ConfigurationError
    );
    await expect(
      repo.createReply({ tweetId: "t1", text: "hi", author })
    ).rejects.toBeInstanceOf(ConfigurationError);
    await expect(
      repo.setReaction("like", "t1", author, true)
    ).rejects.toBeInstanceOf(ConfigurationError);
    expect(client.create).not.toHaveBeenCalled();
  });

  it("never interpolates user input into GROQ", async () => {
    const client = stubClient();
    const repo = createSanityRepository(client, { canWrite: true });
    const evil = '") || true || ("';

    await repo.listTweets({
      search: evil,
      author: evil,
      viewer: evil,
      bookmarkedBy: evil,
      likedBy: evil,
    });

    const [query, params] = (client.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(query).not.toContain(evil);
    expect(params).toMatchObject({
      author: evil.toLowerCase(),
      // Each whitespace-separated word becomes a prefix term.
      search: ['")*', "||*", "true*", "||*", '("*'],
    });
  });

  it("only adds the filter clauses a query needs", () => {
    const plain = tweetListQuery({}, 21);
    expect(
      plain.startsWith(
        `*[${TWEET_FILTER}] | order(_createdAt desc, _id desc) [0...21]`
      )
    ).toBe(true);

    const filtered = tweetListQuery({ author: true, cursor: true }, 6);
    expect(filtered).toContain("lower(username) == $author");
    expect(filtered).toContain("$cursorCreatedAt");
    expect(filtered).not.toContain("$search");
    expect(filtered).not.toContain('bookmark" && lower');
  });

  it("uses deterministic, case-insensitive reaction ids", () => {
    expect(reactionDocumentId("like", "abc-123", "SomeOne")).toBe(
      "like-abc-123-someone"
    );
  });

  it("writes weak references for reactions", async () => {
    const client = stubClient({ fetch: vi.fn().mockResolvedValue("t1") });
    const repo = createSanityRepository(client, { canWrite: true });

    await repo.setReaction("bookmark", "t1", author, true);

    expect(client.createIfNotExists).toHaveBeenCalledWith({
      _id: "bookmark-t1-someone",
      _type: "bookmark",
      tweet: { _type: "reference", _ref: "t1", _weak: true },
      username: "Someone",
      fullname: "Some One",
    });
  });
});
