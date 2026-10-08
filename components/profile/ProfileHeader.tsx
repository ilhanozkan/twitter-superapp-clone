import Link from "next/link";
import {
  HiCheckBadge,
  HiOutlineCalendarDays,
  HiOutlineLink,
  HiOutlineMapPin,
} from "react-icons/hi2";

import { formatJoinDate } from "../../lib/format";
import { displayUrl, safeHref } from "../../lib/text";
import { IUserProfile } from "../../types/User";
import Avatar from "../common/Avatar";
import TweetText from "../tweet/TweetText";

interface ProfileHeaderProps {
  user: IUserProfile;
  /** Which tab is selected. */
  tab: "tweets" | "likes";
}

export default function ProfileHeader({ user, tab }: ProfileHeaderProps) {
  const website = safeHref(user.website);
  const base = `/${user.username}`;

  return (
    <div>
      <div className="aspect-[3/1] w-full bg-[rgb(207_217_222)]">
        {user.banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.banner}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="px-4 pb-3 pt-3">
        <div className="-mt-[15%] mb-3">
          <Avatar user={user} size={134} className="border-4 border-surface" />
        </div>

        <h2 className="flex items-center gap-1 text-xl font-extrabold leading-6">
          {user.fullname}
          {user.verified && (
            <HiCheckBadge
              role="img"
              aria-label="Verified account"
              className="text-primary"
            />
          )}
        </h2>
        <p className="text-[15px] text-muted">@{user.username}</p>

        {user.bio && <TweetText text={user.bio} className="mt-3 text-[15px]" />}

        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[15px] text-muted">
          {user.location && (
            <li className="flex items-center gap-1">
              <HiOutlineMapPin aria-hidden="true" className="text-lg" />
              {user.location}
            </li>
          )}
          {website && (
            <li className="flex items-center gap-1">
              <HiOutlineLink aria-hidden="true" className="text-lg" />
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="text-primary hover:underline"
              >
                {displayUrl(website)}
              </a>
            </li>
          )}
          <li className="flex items-center gap-1">
            <HiOutlineCalendarDays aria-hidden="true" className="text-lg" />
            <span suppressHydrationWarning>
              {formatJoinDate(user.joinedAt)}
            </span>
          </li>
        </ul>
      </div>

      <nav aria-label="Profile timelines" className="flex border-b border-line">
        {[
          { id: "tweets", label: "Tweets", href: base },
          { id: "likes", label: "Likes", href: `${base}/likes` },
        ].map((item) => {
          const active = item.id === tab;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 justify-center transition-colors hover:bg-fg/10"
            >
              <span
                className={`py-4 text-[15px] ${
                  active
                    ? "border-b-4 border-primary pb-3 font-bold"
                    : "font-medium text-muted"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
