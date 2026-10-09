import { ReactNode } from "react";

import { ITweet } from "../../types/Tweet";

export interface ProductAttachmentProps {
  tweet: ITweet;
  /** In a timeline card, or on the Tweet's own page. */
  variant: "card" | "detail";
}

/**
 * Slot (§12.3): the product card attached to a Tweet (`tweet.attachment`),
 * with Order now and View menu. Its controls must be real buttons or links
 * (TweetCard ignores clicks on them). Owned by the business lane; this stub
 * renders nothing.
 */
const ProductAttachment: (props: ProductAttachmentProps) => ReactNode = () =>
  null;
export default ProductAttachment;
