import { ReactNode } from "react";

import { IUserProfile } from "../../types/User";

/**
 * Slot (§12.3): the "Send credits" icon button on a profile. Owned by the
 * wallet lane; this stub renders nothing.
 */
const SendCreditsProfileAction: (props: {
  user: IUserProfile;
}) => ReactNode = () => null;
export default SendCreditsProfileAction;
