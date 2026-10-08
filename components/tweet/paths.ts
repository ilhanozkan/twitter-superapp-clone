import { ITweet } from "../../types/Tweet";

export const profilePath = (username: string) => `/${username}`;

export const statusPath = (tweet: Pick<ITweet, "id" | "author">) =>
  `/${tweet.author.username}/status/${encodeURIComponent(tweet.id)}`;
