import { RiHandCoinLine } from "react-icons/ri";

import { IUserProfile } from "../../types/User";
import { useSendCreditsTo } from "./useSendCreditsTo";

/**
 * Slot (§12.3): the "Send credits" icon button on someone else's profile,
 * which opens Send for them. Not on your own profile, a read-only demo or
 * while the wallet is off.
 */
export default function SendCreditsProfileAction({
  user,
}: {
  user: IUserProfile;
}) {
  const send = useSendCreditsTo(user);
  if (!send) return null;

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`Send credits to @${user.username}`}
      onClick={send}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-fg transition-colors hover:bg-fg/5"
    >
      <RiHandCoinLine aria-hidden="true" className="text-xl" />
    </button>
  );
}
