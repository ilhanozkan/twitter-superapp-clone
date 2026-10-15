import Link from "next/link";
import { useRouter } from "next/router";
import { IconType } from "react-icons";
import {
  HiBell,
  HiBookmark,
  HiEnvelope,
  HiOutlineBell,
  HiOutlineBookmark,
  HiOutlineEnvelope,
  HiOutlineUser,
  HiUser,
} from "react-icons/hi2";
import { IoSearch, IoSearchOutline } from "react-icons/io5";
import {
  RiFileListFill,
  RiFileListLine,
  RiHome7Fill,
  RiHome7Line,
} from "react-icons/ri";

import { useAppSelector } from "../../store";

export interface NavItem {
  label: string;
  href: string;
  icon: IconType;
  activeIcon: IconType;
  isActive: (path: string) => boolean;
}

export function navItems(username: string | null): NavItem[] {
  const profile = username ? `/${username}` : null;
  const lower = (value: string) => value.toLowerCase();

  const items: (NavItem | null)[] = [
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
    },
    {
      label: "Messages",
      href: "/messages",
      icon: HiOutlineEnvelope,
      activeIcon: HiEnvelope,
      isActive: (path) => path === "/messages",
    },
    {
      label: "Bookmarks",
      href: "/i/bookmarks",
      icon: HiOutlineBookmark,
      activeIcon: HiBookmark,
      isActive: (path) => path === "/i/bookmarks",
    },
    profile
      ? {
          label: "Lists",
          href: `${profile}/lists`,
          icon: RiFileListLine,
          activeIcon: RiFileListFill,
          isActive: (path) => lower(path) === lower(`${profile}/lists`),
        }
      : null,
    profile
      ? {
          label: "Profile",
          href: profile,
          icon: HiOutlineUser,
          activeIcon: HiUser,
          isActive: (path) =>
            [profile, `${profile}/likes`].map(lower).includes(lower(path)),
        }
      : null,
  ];

  return items.filter((item): item is NavItem => item !== null);
}

/** The current path without query or hash, for matching nav items. */
export function useCurrentPath() {
  const router = useRouter();
  return router.asPath.split(/[?#]/)[0] || "/";
}

/** Sidebar navigation: icons with labels from 1280px, an icon rail below. */
export default function Navigation() {
  const viewer = useAppSelector((state) => state.session.viewer);
  const path = useCurrentPath();

  return (
    <nav aria-label="Primary">
      <ul>
        {navItems(viewer?.username ?? null).map((item) => {
          const active = item.isActive(path);
          const Icon = active ? item.activeIcon : item.icon;

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className="group flex justify-center py-1 xl:justify-start"
              >
                <span className="flex items-center gap-5 rounded-full p-3 transition-colors duration-200 group-hover:bg-fg/10 xl:pr-6">
                  <Icon aria-hidden="true" className="text-[26px]" />
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
