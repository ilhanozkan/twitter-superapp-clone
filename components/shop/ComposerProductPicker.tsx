import { ReactNode } from "react";

import { TweetAttachmentInput } from "../../types/Tweet";

export interface ComposerProductPickerProps {
  /** The product attached to the Tweet being written, if any. */
  attachment: TweetAttachmentInput | null;
  onChange: (attachment: TweetAttachmentInput | null) => void;
}

/**
 * Slot (§12.3): "Attach a product" in the composer's toolbar, plus the
 * attached product's preview with a Remove button. Rendered only while the
 * shop is on. Owned by the business lane; this stub renders nothing.
 */
const ComposerProductPicker: (
  props: ComposerProductPickerProps
) => ReactNode = () => null;
export default ComposerProductPicker;
