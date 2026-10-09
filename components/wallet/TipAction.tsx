import { ReactNode } from "react";

import { ITweet } from "../../types/Tweet";

export interface TipActionProps {
  tweet: ITweet;
  /** Timelines show the tip count next to the icon; a Tweet's page doesn't. */
  showCount: boolean;
  size: "md" | "lg";
}

/**
 * Slot (§12.3): the Tip action in a Tweet's action row, between Like and
 * Bookmark. Owned by the wallet lane; this stub renders nothing.
 */
const TipAction: (props: TipActionProps) => ReactNode = () => null;
export default TipAction;
