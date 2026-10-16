import { useRouter } from "next/router";
import { createElement } from "react";
import { HiOutlineEnvelope, HiOutlinePaperAirplane } from "react-icons/hi2";

import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { ITweet } from "../../types/Tweet";
import { MenuItem } from "../common/Menu";
import { messageLink } from "./MessageProfileAction";

/**
 * Slot (§12.3): Messages' items in a Tweet's "…" menu, after the wallet's.
 * "Send via Direct Message" shares the Tweet (a write: hidden in
 * READ_ONLY); "Message @user" opens the conversation with its author, on
 * other people's Tweets. A hook, called on every Tweet menu render.
 */
export const useMessageTweetMenuItems: (tweet: ITweet) => MenuItem[] = (
  tweet
) => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const on = useAppSelector((state) => state.session.features.messages);
  if (!on || !viewer) return [];

  const author = tweet.author.username;
  const items: MenuItem[] = [];
  if (!readOnly) {
    items.push({
      label: "Send via Direct Message",
      icon: createElement(HiOutlinePaperAirplane),
      onSelect: () => dispatch(openDialog("newMessage", { tweetId: tweet.id })),
    });
  }
  if (viewer.username.toLowerCase() !== author.toLowerCase()) {
    items.push({
      label: `Message @${author}`,
      icon: createElement(HiOutlineEnvelope),
      onSelect: () => router.push(messageLink(author)),
    });
  }
  return items;
};
