import Link from "next/link";
import { ReactNode } from "react";
import { HiOutlineEnvelope } from "react-icons/hi2";

import { useAppSelector } from "../../store";
import { IUserProfile } from "../../types/User";

/** The conversation with `username`: the existing one, or a draft (§4.5). */
export const messageLink = (username: string) =>
  `/messages?to=${encodeURIComponent(username)}`;

/**
 * Slot (§12.3): the "Message" icon button on someone else's profile, a link
 * to /messages?to=<username> (the conversation, or a draft until the first
 * message). Shown while Messages is on.
 */
const MessageProfileAction: (props: { user: IUserProfile }) => ReactNode = ({
  user,
}) => {
  const viewer = useAppSelector((state) => state.session.viewer);
  const on = useAppSelector((state) => state.session.features.messages);
  if (
    !on ||
    !viewer ||
    viewer.username.toLowerCase() === user.username.toLowerCase()
  )
    return null;

  return (
    <Link
      href={messageLink(user.username)}
      aria-label={`Message ${user.fullname}`}
      title="Message"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-xl transition-colors hover:bg-fg/5"
    >
      <HiOutlineEnvelope aria-hidden="true" />
    </Link>
  );
};
export default MessageProfileAction;
