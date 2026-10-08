import { TweetPageResponse } from "../types/Api";
import { ITweet } from "../types/Tweet";

/** Client-side refresh of the feed (server-side code uses the repository directly). */
export default async function fetchTweets(): Promise<ITweet[]> {
  const res = await fetch("/api/tweets?limit=50");
  if (!res.ok) throw new Error(`Loading tweets failed (${res.status})`);

  const data: TweetPageResponse = await res.json();
  return data.items;
}
