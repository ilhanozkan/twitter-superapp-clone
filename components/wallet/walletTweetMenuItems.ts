import { ITweet } from "../../types/Tweet";
import { MenuItem } from "../common/Menu";

/**
 * Slot (§12.3): the wallet's items in a Tweet's "…" menu ("Send credits to
 * @user"). A hook, called on every Tweet menu render. Owned by the wallet
 * lane; this stub adds nothing.
 */
export const useWalletTweetMenuItems: (tweet: ITweet) => MenuItem[] = () => [];
