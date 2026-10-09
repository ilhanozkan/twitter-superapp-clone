import { ITweet } from "../../types/Tweet";
import { MenuItem } from "../common/Menu";

/**
 * Slot (§12.3): Messages' items in a Tweet's "…" menu ("Send via Direct
 * Message", "Message @user"), after the wallet's. A hook, called on every
 * Tweet menu render. Owned by the messages lane; this stub adds nothing.
 */
export const useMessageTweetMenuItems: (tweet: ITweet) => MenuItem[] = () => [];
