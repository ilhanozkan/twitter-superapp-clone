import Link from "next/link";
import { useRouter } from "next/router";
import { IconType } from "react-icons";
import {
  HiBell,
  HiBookmark,
  HiBuildingStorefront,
  HiEnvelope,
  HiOutlineBell,
  HiOutlineBookmark,
  HiOutlineBuildingStorefront,
  HiOutlineEnvelope,
  HiOutlineSquares2X2,
  HiOutlineUser,
  HiOutlineWallet,
  HiSquares2X2,
  HiUser,
  HiWallet,
} from "react-icons/hi2";
import { IoSearch, IoSearchOutline } from "react-icons/io5";
import {
  RiFileListFill,
  RiFileListLine,
  RiHome7Fill,
  RiHome7Line,
} from "react-icons/ri";

import { useAppSelector } from "../../store";
import { IFeatures } from "../../types/Superapp";
import Badge from "../superapp/Badge";

export type NavLabel =
  | "Home"
  | "Explore"
  | "Notifications"
  | "Messages"
  | "Wallet"
  | "Services"
  | "Bookmarks"
  | "Lists"
  | "Profile"
  | "Business";

export interface NavItem {
  label: NavLabel;
  href: string;
  icon: IconType;
  activeIcon: IconType;
  isActive: (path: string) => boolean;
  /** A count on the icon; it is also spoken as part of the link's name. */
  badge?: { count: number; spoken: string };
}

export interface NavContext {
  username: string | null;
  features: IFeatures;
  managedBusinesses: string[];
  /** null until the client has counted with this device's "seen" time. */
  newNotifications: number | null;
  unreadConversations: number;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const lower = (value: string) => value.toLowerCase();
const within = (prefix: string) => (path: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

/**
 * Every destination, in sidebar order. Items of SuperApp features appear
 * only while the feature is on; Business only for people who run one, and
 * only while the shop is on. Services always shows.
 */
export function navItems({
  username,
  features,
  managedBusinesses,
  newNotifications,
  unreadConversations,
}: NavContext): NavItem[] {
  const profile = username ? `/${username}` : null;

  const items: (NavItem | false)[] = [
    {
      label: "Home",
      href: "/",
      icon: RiHome7Line,
      activeIcon: RiHome7Fill,
      isActive: (path) => path === "/",
    },
    {
      label: "Explore",
      href: "/explore",
      icon: IoSearchOutline,
      activeIcon: IoSearch,
      isActive: (path) => path === "/explore",
    },
    {
      label: "Notifications",
      href: "/notifications",
      icon: HiOutlineBell,
      activeIcon: HiBell,
      isActive: (path) => path === "/notifications",
      badge: newNotifications
        ? { count: newNotifications, spoken: `${newNotifications} new` }
        : undefined,
    },
    {
      label: "Messages",
      href: "/messages",
      icon: HiOutlineEnvelope,
      activeIcon: HiEnvelope,
      isActive: within("/messages"),
      badge:
        features.messages && unreadConversations > 0
          ? {
              count: unreadConversations,
              spoken: plural(
                unreadConversations,
                "unread conversation",
                "unread conversations"
              ),
            }
          : undefined,
    },
    features.wallet && {
      label: "Wallet",
      href: "/wallet",
      icon: HiOutlineWallet,
      activeIcon: HiWallet,
      isActive: within("/wallet"),
    },
    {
      label: "Services",
      href: "/services",
      icon: HiOutlineSquares2X2,
      activeIcon: HiSquares2X2,
      isActive: (path) => path === "/services",
    },
    {
      label: "Bookmarks",
      href: "/i/bookmarks",
      icon: HiOutlineBookmark,
      activeIcon: HiBookmark,
      isActive: (path) => path === "/i/bookmarks",
    },
    !!profile && {
      label: "Lists",
      href: `${profile}/lists`,
      icon: RiFileListLine,
      activeIcon: RiFileListFill,
      isActive: (path) => lower(path) === lower(`${profile}/lists`),
    },
    !!profile && {
      label: "Profile",
      href: profile,
      icon: HiOutlineUser,
      activeIcon: HiUser,
      isActive: (path) =>
        [profile, `${profile}/likes`].map(lower).includes(lower(path)),
    },
    features.shop &&
      managedBusinesses.length > 0 && {
        label: "Business",
        href: "/business",
        icon: HiOutlineBuildingStorefront,
        activeIcon: HiBuildingStorefront,
        isActive: within("/business"),
      },
  ];

  return items.filter((item): item is NavItem => !!item);
}

/** The nav items for the current viewer, with live badge counts. */
export function useNavItems(): NavItem[] {
  const session = useAppSelector((state) => state.session);
  const activity = useAppSelector((state) => state.activity);
  return navItems({
    username: session.viewer?.username ?? null,
    features: session.features,
    managedBusinesses: session.managedBusinesses,
    newNotifications: activity.loaded ? activity.newNotifications : null,
    unreadConversations: activity.unreadConversations,
  });
}

/** The current path without query or hash, for matching nav items. */
export function useCurrentPath() {
  const router = useRouter();
  return router.asPath.split(/[?#]/)[0] || "/";
}

/** An item's icon with its badge, and its spoken name ("Messages, 1 unread conversation"). */
export function NavIcon({
  item,
  active,
  className,
}: {
  item: NavItem;
  active: boolean;
  className?: string;
}) {
  const Icon = active ? item.activeIcon : item.icon;
  return (
    <span className={`relative flex ${className ?? ""}`}>
      <Icon aria-hidden="true" />
      {item.badge && (
        <Badge
          count={item.badge.count}
          className="absolute -right-2 -top-1.5"
        />
      )}
    </span>
  );
}

/** "Messages, 1 unread conversation": the item's name with its badge. */
export const navName = (item: NavItem) =>
  item.badge ? `${item.label}, ${item.badge.spoken}` : item.label;

/** Sidebar navigation: icons with labels from 1280px, an icon rail below. */
export default function Navigation() {
  const items = useNavItems();
  const path = useCurrentPath();

  return (
    <nav aria-label="Primary">
      <ul>
        {items.map((item) => {
          const active = item.isActive(path);

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                // With a badge the name says the count: "Notifications, 3 new".
                aria-label={item.badge ? navName(item) : undefined}
                title={item.label}
                className="group flex justify-center py-1 xl:justify-start"
              >
                <span className="flex items-center gap-5 rounded-full p-3 transition-colors duration-200 group-hover:bg-fg/10 xl:pr-6">
                  <NavIcon
                    item={item}
                    active={active}
                    className="text-[26px]"
                  />
                  <span
                    className={`sr-only text-xl xl:not-sr-only ${active ? "font-bold" : ""}`}
                  >
                    {item.label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
