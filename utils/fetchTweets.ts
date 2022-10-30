import { ITweet, ITweetsData } from "../types/Tweet";

export default async function fetchTweets() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/getTweets`);

  const data: ITweetsData = await res.json();
  const tweets: ITweet[] = data.tweets;

  return tweets;
}
