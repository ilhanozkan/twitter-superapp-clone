import { useRouter } from "next/router";
import Link from "next/link";
import React from "react";

// Icons
import {
  // Home icons
  RiHome7Line,
  RiHome7Fill,
  // List icons
  RiFileListLine,
  RiFileListFill,
} from "react-icons/ri";
// Search icons
import { IoSearchOutline, IoSearch } from "react-icons/io5";
import {
  // Bell icons
  HiOutlineBell,
  HiBell,
  // Bookmark icons
  HiOutlineBookmark,
  HiBookmark,
  // Bell icons
  HiUser,
  HiOutlineUser,
} from "react-icons/hi2";

import {
  // Messages icons
  HiOutlineMail,
  HiMail,
} from "react-icons/hi";

import { INavItem } from "../types/Nav";

const Navigation = () => {
  const router = useRouter();

  const navigation = [
    {
      icon: RiHome7Line,
      activeIcon: RiHome7Fill,
      name: "Home",
      link: "/",
      active: false,
    },
    {
      icon: IoSearchOutline,
      activeIcon: IoSearch,
      name: "Explore",
      link: "/explore",
      active: false,
    },
    {
      icon: HiOutlineBell,
      activeIcon: HiBell,
      name: "Notifications",
      link: "/notifications",
      active: false,
    },
    {
      icon: HiOutlineMail,
      activeIcon: HiMail,
      name: "Messages",
      link: "/messages",
      active: false,
    },
    {
      icon: HiOutlineBookmark,
      activeIcon: HiBookmark,
      name: "Bookmarks",
      link: "/i/bookmarks",
      active: false,
    },
    {
      icon: RiFileListLine,
      activeIcon: RiFileListFill,
      name: "Lists",
      link: "/username/lists",
      active: false,
    },
    {
      icon: HiOutlineUser,
      activeIcon: HiUser,
      name: "Profile",
      link: "/username",
      active: false,
    },
  ];

  navigation.find((nav) => router.pathname == nav.link)!.active = true;

  return (
    <ul>
      {navigation.map((navItem: INavItem) => (
        <Link key={navItem.name} href={navItem.link}>
          <li>
            <a
              className={`mt-2.5 flex w-fit cursor-pointer items-center rounded-full py-2.5 pl-3 pr-7 transition-colors duration-200 hover:bg-gray-200`}
            >
              {navItem.active
                ? React.createElement(
                    navItem.activeIcon,
                    { size: "1.8rem" },
                    null
                  )
                : React.createElement(navItem.icon, { size: "1.8rem" }, null)}

              {navItem.active ? (
                <p className="ml-4 text-lg">
                  <strong>{navItem.name}</strong>
                </p>
              ) : (
                <p className="ml-4 text-lg">{navItem.name}</p>
              )}
            </a>
          </li>
        </Link>
      ))}
    </ul>
  );
};

export default Navigation;
