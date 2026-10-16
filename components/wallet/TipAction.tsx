import { ReactNode } from "react";
import { RiCoinFill, RiCoinLine } from "react-icons/ri";

import { formatCount } from "../../lib/format";
import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { ITweet } from "../../types/Tweet";

export interface TipActionProps {
  tweet: ITweet;
  /** Timelines show the tip count next to the icon; a Tweet's page doesn't. */
  showCount: boolean;
  size: "md" | "lg";
}

/** "3 tips": how many, never how much (only the author sees amounts). */
export const tipsText = (tips: number) =>
  `${tips} ${tips === 1 ? "tip" : "tips"}`;

/** The Tip button's accessible name. */
export function tipLabel(tweet: ITweet): string {
  const count = tipsText(tweet.stats.tips);
  return tweet.viewer.tipped
    ? `Tip again. You tipped this Tweet. ${count}`
    : `Tip. ${count}`;
}

// The same box as the row's other actions (TweetActions' ActionContent), so
// the six of them still fit a 360px phone.
const BASE =
  "group -my-1.5 flex items-center transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";
const TONE =
  "hover:text-tip group-hover:text-tip [&_.bubble]:group-hover:bg-tip/10";
const BUBBLE: Record<TipActionProps["size"], string> = {
  md: "p-2 text-lg",
  lg: "p-2 text-[22px]",
};

function Content({
  icon,
  count,
  showCount,
  size,
}: {
  icon: ReactNode;
  count: number;
  showCount: boolean;
  size: TipActionProps["size"];
}) {
  return (
    <>
      <span
        className={`bubble flex items-center justify-center rounded-full transition-colors duration-150 ${BUBBLE[size]}`}
      >
        {icon}
      </span>
      {showCount && (
        // The accessible name or the sr-only text says the count in words.
        <span
          aria-hidden="true"
          className="min-w-[1ch] text-[13px] tabular-nums"
        >
          {count ? formatCount(count) : ""}
        </span>
      )}
    </>
  );
}

/**
 * Slot (§12.3): Tip, the fourth of the six actions under a Tweet. It opens
 * the tip sheet (ui.dialog "tip" with `{ tweetId }`) and turns filled and
 * amber once the viewer has tipped. On your own Tweet it is plain text in
 * the same place, so the row stays aligned; on a read-only demo it is
 * disabled like the reactions. Absent while the wallet is off.
 */
export default function TipAction({ tweet, showCount, size }: TipActionProps) {
  const dispatch = useAppDispatch();
  const on = useAppSelector((state) => state.session.features.wallet);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const viewer = useAppSelector((state) => state.session.viewer?.username);
  if (!on) return null;

  const { tips } = tweet.stats;
  const own =
    !!viewer && viewer.toLowerCase() === tweet.author.username.toLowerCase();

  if (own) {
    return (
      <span className={`${BASE} text-muted`}>
        <Content
          icon={<RiCoinLine aria-hidden="true" />}
          count={tips}
          showCount={showCount}
          size={size}
        />
        <span className="sr-only">{tipsText(tips)}</span>
      </span>
    );
  }

  const { tipped } = tweet.viewer;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={tipLabel(tweet)}
      disabled={readOnly}
      onClick={() => dispatch(openDialog("tip", { tweetId: tweet.id }))}
      // Active and idle colours must not both be present (see TweetActions).
      className={`${BASE} ${TONE} ${tipped ? "text-tip" : "text-muted"}`}
    >
      <Content
        icon={
          tipped ? (
            <RiCoinFill aria-hidden="true" />
          ) : (
            <RiCoinLine aria-hidden="true" />
          )
        }
        count={tips}
        showCount={showCount}
        size={size}
      />
    </button>
  );
}
