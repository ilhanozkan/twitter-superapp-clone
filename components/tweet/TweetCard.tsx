import Link from "next/link";
import { useRouter } from "next/router";
import { MouseEvent } from "react";

import { ITweet } from "../../types/Tweet";
import Avatar from "../common/Avatar";
import RelativeTime from "../common/RelativeTime";
import { profilePath, statusPath } from "./paths";
import TweetActions from "./TweetActions";
import TweetImage from "./TweetImage";
import TweetMenu from "./TweetMenu";
import TweetText from "./TweetText";

const INTERACTIVE = "a, button, input, textarea, [role='menu'], dialog";

/** A tweet in a timeline. Clicking anywhere that is not a control opens the tweet. */
export default function TweetCard({ tweet }: { tweet: ITweet }) {
  const router = useRouter();
  const profile = profilePath(tweet.author.username);

  const openTweet = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    // Selecting text should not navigate away.
    if (window.getSelection()?.toString()) return;
    // Like a link: modifier and middle clicks open the tweet in a new tab.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button === 1
    ) {
      window.open(statusPath(tweet), "_blank", "noopener");
      return;
    }
    router.push(statusPath(tweet));
  };

  return (
    <article
      aria-labelledby={`tweet-${tweet.id}-author`}
      onClick={openTweet}
      onAuxClick={(event) => {
        if (event.button === 1) openTweet(event);
      }}
      className="flex cursor-pointer gap-3 border-b border-line px-4 pb-2 pt-3 transition-colors duration-200 hover:bg-fg/[0.03]"
    >
      <Link
        href={profile}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0"
      >
        <Avatar user={tweet.author} />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[15px] leading-5">
          <Link
            id={`tweet-${tweet.id}-author`}
            href={profile}
            className="truncate font-bold hover:underline"
          >
            {tweet.author.fullname}
          </Link>
          <Link href={profile} tabIndex={-1} className="truncate text-muted">
            @{tweet.author.username}
          </Link>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <Link
            href={statusPath(tweet)}
            className="shrink-0 text-muted hover:underline"
          >
            <RelativeTime iso={tweet.createdAt} />
          </Link>
          <div className="ml-auto pl-2">
            <TweetMenu tweet={tweet} />
          </div>
        </div>

        <TweetText text={tweet.text} className="text-[15px] leading-5" />
        {tweet.image && <TweetImage src={tweet.image} />}
        <TweetActions tweet={tweet} />
      </div>
    </article>
  );
}
