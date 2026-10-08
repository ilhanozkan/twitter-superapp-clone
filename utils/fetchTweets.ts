import { ITweet, ITweetsData } from "../types/Tweet";

/** Client-side refresh of the feed (server-side code uses the repository directly). */
export default async function fetchTweets() {
  const res = await fetch("/api/getTweets");

  const data: ITweetsData = await res.json();
  const tweets: ITweet[] = data.tweets;

  return tweets;
}
