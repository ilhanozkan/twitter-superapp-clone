import { useCallback, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { storiesApi } from "../../lib/client/storiesApi";
import { IStory } from "../../types/Story";

export type AccountStories =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stories: IStory[] };

const LOADING: AccountStories = { status: "loading" };

/**
 * The viewer's stories per account (GET /api/stories?author=), loaded when
 * an account comes up and kept while the viewer is open, so going back to
 * one doesn't load it again.
 */
export function useStoryAccounts() {
  const [accounts, setAccounts] = useState<Record<string, AccountStories>>({});
  const requested = useRef(new Set<string>());

  const settle = useCallback((key: string, state: AccountStories) => {
    setAccounts((previous) => ({ ...previous, [key]: state }));
  }, []);

  const fetchAccount = useCallback(
    (username: string) => {
      const key = username.toLowerCase();
      requested.current.add(key);
      storiesApi.list(username).then(
        ({ items }) => settle(key, { status: "ready", stories: items }),
        (error: unknown) =>
          settle(key, { status: "error", message: errorMessage(error) })
      );
    },
    [settle]
  );

  /** Loads an account's stories unless they are loaded or on their way. */
  const load = useCallback(
    (username: string) => {
      if (!requested.current.has(username.toLowerCase()))
        fetchAccount(username);
    },
    [fetchAccount]
  );

  const retry = useCallback(
    (username: string) => {
      settle(username.toLowerCase(), LOADING);
      fetchAccount(username);
    },
    [fetchAccount, settle]
  );

  /** Drops a story the author just deleted. */
  const removeStory = useCallback((username: string, id: string) => {
    const key = username.toLowerCase();
    setAccounts((previous) => {
      const account = previous[key];
      if (account?.status !== "ready") return previous;
      return {
        ...previous,
        [key]: {
          status: "ready",
          stories: account.stories.filter((story) => story.id !== id),
        },
      };
    });
  }, []);

  const get = useCallback(
    (username: string): AccountStories =>
      accounts[username.toLowerCase()] ?? LOADING,
    [accounts]
  );

  return { get, load, retry, removeStory };
}
