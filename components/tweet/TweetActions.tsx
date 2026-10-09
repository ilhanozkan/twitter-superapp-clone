import Link from "next/link";
import { useState } from "react";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { FaRetweet } from "react-icons/fa";
import { HiBookmark, HiOutlineBookmark, HiOutlineUpload } from "react-icons/hi";
import { RiChat1Line } from "react-icons/ri";

import { formatCount } from "../../lib/format";
import { setReaction } from "../../slices/tweetsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { ITweet } from "../../types/Tweet";
import TipAction from "../wallet/TipAction";
import { statusPath } from "./paths";

interface TweetActionsProps {
  tweet: ITweet;
  /** On a tweet's own page the counts are shown above the buttons instead. */
  showCounts?: boolean;
  size?: "md" | "lg";
}

const tones = {
  primary:
    "hover:text-primary group-hover:text-primary [&_.bubble]:group-hover:bg-primary/10",
  retweet:
    "hover:text-retweet group-hover:text-retweet [&_.bubble]:group-hover:bg-retweet/10",
  like: "hover:text-like group-hover:text-like [&_.bubble]:group-hover:bg-like/10",
};

function ActionContent({
  icon,
  count,
  showCount,
  size,
}: {
  icon: React.ReactNode;
  count?: number;
  showCount: boolean;
  size: "md" | "lg";
}) {
  return (
    <>
      <span
        className={`bubble flex items-center justify-center rounded-full transition-colors duration-150 ${
          size === "lg" ? "p-2 text-[22px]" : "p-2 text-lg"
        }`}
      >
        {icon}
      </span>
      {showCount && (
        <span className="min-w-[1ch] text-[13px] tabular-nums">
          {count ? formatCount(count) : ""}
        </span>
      )}
    </>
  );
}

export default function TweetActions({
  tweet,
  showCounts = true,
  size = "md",
}: TweetActionsProps) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  // Animate the heart only when the user likes, not when a liked tweet renders.
  const [popped, setPopped] = useState(false);

  const toggle = async (
    kind: "like" | "retweet" | "bookmark",
    active: boolean
  ) => {
    if (kind === "like") setPopped(active);
    const result = await dispatch(setReaction({ id: tweet.id, kind, active }));

    // Clicks merged into a later one are "stale": only the last one reports.
    if (setReaction.rejected.match(result) && !result.payload?.stale) {
      dispatch(
        showToast({
          tone: "error",
          message:
            result.payload?.message ?? "Something went wrong. Try again.",
        })
      );
    } else if (
      setReaction.fulfilled.match(result) &&
      !result.payload.stale &&
      kind === "bookmark"
    ) {
      dispatch(
        showToast(
          active
            ? {
                message: "Added to your Bookmarks",
                action: { label: "View", href: "/i/bookmarks" },
              }
            : { message: "Removed from your Bookmarks" }
        )
      );
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${statusPath(tweet)}`;
    try {
      await navigator.clipboard.writeText(url);
      dispatch(showToast({ message: "Copied to clipboard" }));
    } catch {
      window.prompt("Copy the link to this Tweet", url);
    }
  };

  const base = `group -my-1.5 flex items-center transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60`;
  // Active and idle colors must not both be present: the stylesheet order would pick one.
  const color = (active: boolean, activeColor: string) =>
    active ? activeColor : "text-muted";
  const { liked, retweeted, bookmarked } = tweet.viewer;

  return (
    <div
      role="group"
      aria-label="Tweet actions"
      className={`flex items-center justify-between ${size === "lg" ? "px-1" : "-ml-2 mt-1 max-w-[425px]"}`}
    >
      <Link
        href={`${statusPath(tweet)}#reply`}
        aria-label={`Reply. ${tweet.stats.replies} replies`}
        className={`${base} ${tones.primary} text-muted`}
      >
        <ActionContent
          icon={<RiChat1Line aria-hidden="true" />}
          count={tweet.stats.replies}
          showCount={showCounts}
          size={size}
        />
      </Link>

      <button
        type="button"
        aria-pressed={retweeted}
        aria-label={`Retweet. ${tweet.stats.retweets} Retweets`}
        disabled={readOnly}
        onClick={() => toggle("retweet", !retweeted)}
        className={`${base} ${tones.retweet} ${color(retweeted, "text-retweet")}`}
      >
        <ActionContent
          icon={<FaRetweet aria-hidden="true" />}
          count={tweet.stats.retweets}
          showCount={showCounts}
          size={size}
        />
      </button>

      <button
        type="button"
        aria-pressed={liked}
        aria-label={`Like. ${tweet.stats.likes} Likes`}
        disabled={readOnly}
        onClick={() => toggle("like", !liked)}
        className={`${base} ${tones.like} ${color(liked, "text-like")}`}
      >
        <ActionContent
          icon={
            liked ? (
              <AiFillHeart
                aria-hidden="true"
                className={popped ? "animate-pop" : ""}
                onAnimationEnd={() => setPopped(false)}
              />
            ) : (
              <AiOutlineHeart aria-hidden="true" />
            )
          }
          count={tweet.stats.likes}
          showCount={showCounts}
          size={size}
        />
      </button>

      <TipAction tweet={tweet} showCount={showCounts} size={size} />

      <button
        type="button"
        aria-pressed={bookmarked}
        aria-label="Bookmark"
        disabled={readOnly}
        onClick={() => toggle("bookmark", !bookmarked)}
        className={`${base} ${tones.primary} ${color(bookmarked, "text-primary")}`}
      >
        <ActionContent
          icon={
            bookmarked ? (
              <HiBookmark aria-hidden="true" />
            ) : (
              <HiOutlineBookmark aria-hidden="true" />
            )
          }
          showCount={false}
          size={size}
        />
      </button>

      <button
        type="button"
        aria-label="Copy link to Tweet"
        onClick={share}
        className={`${base} ${tones.primary} text-muted`}
      >
        <ActionContent
          icon={<HiOutlineUpload aria-hidden="true" />}
          showCount={false}
          size={size}
        />
      </button>
    </div>
  );
}
