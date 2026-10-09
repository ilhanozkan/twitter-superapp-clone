import Link from "next/link";

import { formatCount, formatFullDate } from "../../lib/format";
import { ITweet } from "../../types/Tweet";
import Avatar from "../common/Avatar";
import ProductAttachment from "../shop/ProductAttachment";
import { profilePath } from "./paths";
import TweetActions from "./TweetActions";
import TweetImage from "./TweetImage";
import TweetMenu from "./TweetMenu";
import TweetText from "./TweetText";

/** The focused tweet on its own page. */
export default function TweetDetail({ tweet }: { tweet: ITweet }) {
  const profile = profilePath(tweet.author.username);
  const { retweets, likes, tips } = tweet.stats;

  return (
    <article aria-labelledby="focused-tweet-author" className="px-4 pt-3">
      <div className="flex items-center gap-3">
        <Link href={profile} tabIndex={-1} aria-hidden="true">
          <Avatar user={tweet.author} />
        </Link>
        <div className="min-w-0 flex-1 leading-5">
          <Link
            id="focused-tweet-author"
            href={profile}
            className="block truncate text-[15px] font-bold hover:underline"
          >
            {tweet.author.fullname}
          </Link>
          <Link
            href={profile}
            tabIndex={-1}
            className="block truncate text-[15px] text-muted"
          >
            @{tweet.author.username}
          </Link>
        </div>
        <TweetMenu tweet={tweet} />
      </div>

      <TweetText text={tweet.text} className="mt-3 text-[17px] leading-6" />
      {tweet.image && <TweetImage src={tweet.image} />}
      <ProductAttachment tweet={tweet} variant="detail" />

      <p className="my-4 text-[15px] text-muted">
        <time dateTime={tweet.createdAt} suppressHydrationWarning>
          {formatFullDate(tweet.createdAt)}
        </time>
      </p>

      {(retweets > 0 || likes > 0 || tips > 0) && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line py-4 text-[15px] text-muted">
          {retweets > 0 && (
            <span>
              <strong className="text-fg">{formatCount(retweets)}</strong>{" "}
              {retweets === 1 ? "Retweet" : "Retweets"}
            </span>
          )}
          {likes > 0 && (
            <span>
              <strong className="text-fg">{formatCount(likes)}</strong>{" "}
              {likes === 1 ? "Like" : "Likes"}
            </span>
          )}
          {tips > 0 && (
            <span>
              <strong className="text-fg">{formatCount(tips)}</strong>{" "}
              {tips === 1 ? "Tip" : "Tips"}
            </span>
          )}
        </p>
      )}

      <div className="border-y border-line py-1">
        <TweetActions tweet={tweet} showCounts={false} size="lg" />
      </div>
    </article>
  );
}
