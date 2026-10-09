import { ReactNode } from "react";

import { IUserProfile } from "../../types/User";

/**
 * Slot (§12.3): the "Message" icon button on a profile, a link to
 * /messages?to=<username>. Owned by the messages lane; this stub renders
 * nothing.
 */
const MessageProfileAction: (props: { user: IUserProfile }) => ReactNode = () =>
  null;
export default MessageProfileAction;
