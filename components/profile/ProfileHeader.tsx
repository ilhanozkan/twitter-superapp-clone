import Link from "next/link";
import {
  HiCheckBadge,
  HiOutlineBuildingStorefront,
  HiOutlineCalendarDays,
  HiOutlineLink,
  HiOutlineMapPin,
} from "react-icons/hi2";

import { formatJoinDate } from "../../lib/format";
import { displayUrl, safeHref } from "../../lib/text";
import { useAppSelector } from "../../store";
import { BusinessCategory, IBusiness } from "../../types/Business";
import { IUserProfile } from "../../types/User";
import Avatar from "../common/Avatar";
import MessageProfileAction from "../messages/MessageProfileAction";
import RideHereLink from "../rides/RideHereLink";
import BusinessInfo from "../shop/BusinessInfo";
import OrderButton from "../shop/OrderButton";
import TweetText from "../tweet/TweetText";
import SendCreditsProfileAction from "../wallet/SendCreditsProfileAction";

export type ProfileTab = "tweets" | "menu" | "likes";

interface ProfileHeaderProps {
  user: IUserProfile;
  /** The business behind a business account, if it has a profile. */
  business?: IBusiness | null;
  /** Which tab is selected. */
  tab: ProfileTab;
}

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  healthy: "Healthy",
  shop: "Shop",
};

export default function ProfileHeader({
  user,
  business = null,
  tab,
}: ProfileHeaderProps) {
  const shopOn = useAppSelector((state) => state.session.features.shop);
  const website = safeHref(user.website);
  const base = `/${user.username}`;

  const tabs: { id: ProfileTab; label: string; href: string }[] = [
    { id: "tweets", label: "Tweets", href: base },
    ...(business && shopOn
      ? [{ id: "menu" as const, label: "Menu", href: `${base}/menu` }]
      : []),
    { id: "likes", label: "Likes", href: `${base}/likes` },
  ];

  return (
    <div>
      <div className="aspect-[3/1] w-full bg-banner">
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
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="-mt-[15%] min-w-0">
            <Avatar
              user={user}
              size={134}
              className="border-4 border-surface"
            />
          </div>
          {/* Each feature's own actions (§12.3): Order, Message, Send credits. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MessageProfileAction user={user} />
            <SendCreditsProfileAction user={user} />
            {business && <OrderButton business={business} />}
          </div>
        </div>

        <h2 className="flex items-center gap-1 text-xl font-extrabold leading-6">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {user.fullname}
          </span>
          {user.verified && (
            <HiCheckBadge
              role="img"
              aria-label="Verified account"
              className="text-primary"
            />
          )}
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-muted">
          <span>@{user.username}</span>
          {/* Text with an icon, never a badge that could pass for verification. */}
          {user.accountType === "business" && (
            <span className="flex items-center gap-1">
              <HiOutlineBuildingStorefront aria-hidden="true" />
              {business
                ? `Business · ${CATEGORY_LABELS[business.category]}`
                : "Business"}
            </span>
          )}
        </p>

        {user.bio && <TweetText text={user.bio} className="mt-3 text-[15px]" />}

        {business && (
          <div className="mt-3 flex flex-col gap-1 text-[15px] text-muted">
            <BusinessInfo business={business} />
            <RideHereLink placeId={business.placeId} />
          </div>
        )}

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
        {tabs.map((item) => {
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
