// Store keys and GET /api/tweets queries of every timeline, shared by the
// pages' getServerSideProps and the client so "load more" asks for the same.

export interface TimelineSpec {
  key: string;
  query: Record<string, string>;
}

export const timelines = {
  home: (): TimelineSpec => ({ key: "home", query: {} }),

  author: (username: string): TimelineSpec => ({
    key: `author:${username.toLowerCase()}`,
    query: { author: username },
  }),

  likes: (username: string): TimelineSpec => ({
    key: `likes:${username.toLowerCase()}`,
    query: { likedBy: username },
  }),

  search: (q: string): TimelineSpec => ({ key: `search:${q}`, query: { q } }),

  bookmarks: (): TimelineSpec => ({
    key: "bookmarks",
    query: { bookmarked: "true" },
  }),
};
