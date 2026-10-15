import { ReactNode } from "react";

import { IStoryTrayItem } from "../../types/Story";

/**
 * Slot (§12.3): the story tray on Home, between the header and the
 * composer. Owned by the stories lane; this stub renders nothing.
 */
const StoriesTray: (props: { items: IStoryTrayItem[] }) => ReactNode = () =>
  null;
export default StoriesTray;
