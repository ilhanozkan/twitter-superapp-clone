import { createElement } from "react";
import { RiHandCoinLine } from "react-icons/ri";

import { ITweet } from "../../types/Tweet";
import { MenuItem } from "../common/Menu";
import { useSendCreditsTo } from "./useSendCreditsTo";

/**
 * Slot (§12.3): the wallet's items in a Tweet's "…" menu, a hook called on
 * every Tweet. Others' Tweets get "Send credits to @user", which opens Send
 * for the author; your own Tweets, a read-only demo and a wallet that is
 * off get nothing.
 */
export function useWalletTweetMenuItems(tweet: ITweet): MenuItem[] {
  const send = useSendCreditsTo(tweet.author);
  if (!send) return [];

  return [
    {
      label: `Send credits to @${tweet.author.username}`,
      icon: createElement(RiHandCoinLine),
      onSelect: send,
    },
  ];
}
