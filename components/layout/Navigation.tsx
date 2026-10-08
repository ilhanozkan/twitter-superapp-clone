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

interface NavItem {
  label: string;
  href: string;
  icon: IconType;
  activeIcon: IconType;
  isActive: (path: string) => boolean;
}

function navItems(username: string | null): NavItem[] {
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

export default function Navigation() {
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const path = router.asPath.split(/[?#]/)[0] || "/";

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
                className="group flex py-1"
              >
                <span className="flex items-center gap-5 rounded-full p-3 pr-6 transition-colors duration-200 group-hover:bg-fg/10">
                  <Icon aria-hidden="true" className="text-[26px]" />
                  <span className={`text-xl ${active ? "font-bold" : ""}`}>
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
