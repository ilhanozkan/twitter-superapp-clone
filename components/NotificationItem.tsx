import Link from "next/link";
import { AiFillHeart } from "react-icons/ai";
import { FaRetweet } from "react-icons/fa";
import { RiChat1Fill } from "react-icons/ri";

import { INotification } from "../types/Notification";
import Avatar from "./common/Avatar";
import RelativeTime from "./common/RelativeTime";
import { statusPath } from "./tweet/paths";

const kinds = {
  like: { icon: AiFillHeart, color: "text-like", verb: "liked your Tweet" },
  retweet: {
    icon: FaRetweet,
    color: "text-retweet",
    verb: "Retweeted your Tweet",
  },
  reply: {
    icon: RiChat1Fill,
    color: "text-primary",
    verb: "replied to your Tweet",
  },
};

export default function NotificationItem({
  notification,
  viewerUsername,
}: {
  notification: INotification;
  viewerUsername: string;
}) {
  const kind = kinds[notification.type];
  const Icon = kind.icon;
  const href = statusPath({
    id: notification.tweet.id,
    author: { username: viewerUsername, fullname: "", image: null },
  });

  return (
    <article className="relative flex gap-3 border-b border-line px-4 py-3 transition-colors duration-200 hover:bg-fg/[0.03]">
      <Icon
        aria-hidden="true"
        className={`mt-1 w-10 shrink-0 text-[28px] ${kind.color}`}
      />
      <div className="min-w-0 flex-1">
        <Avatar user={notification.actor} size={32} />
        <p className="mt-2 text-[15px]">
          <Link href={href} className="after:absolute after:inset-0">
            <strong>{notification.actor.fullname}</strong> {kind.verb}
          </Link>
          <span className="text-muted">
            {" · "}
            <RelativeTime iso={notification.createdAt} />
          </span>
        </p>
        {/* Plain text: the whole card is one link to the tweet. */}
        <p
          className={`mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[15px] ${
            notification.reply ? "" : "text-muted"
          }`}
        >
          {notification.reply?.text ?? notification.tweet.text}
        </p>
      </div>
    </article>
  );
}
