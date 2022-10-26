import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

// Icons
// Twitter icon
import { BsTwitter } from "react-icons/bs";
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
  // Dots icons
  HiOutlineDotsCircleHorizontal,
  HiOutlineDotsHorizontal,
} from "react-icons/hi";

const Sidebar = () => {
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
    <div className="flex h-screen w-72 flex-col justify-between border-r border-gray-100 px-4">
      <div>
        <div className="max-w-fit cursor-pointer rounded-full p-3 transition-colors duration-200 hover:bg-primary/10">
          <Link href="/">
            <BsTwitter size="1.8rem" className="text-primary" />
          </Link>
        </div>
        <ul>
          {navigation.map((nav) => (
            <Link key={nav.name} href={nav.link}>
              <li>
                <a
                  className={`mt-2.5 flex w-fit cursor-pointer items-center rounded-full py-2.5 pl-3 pr-7 transition-colors duration-200 hover:bg-gray-200`}
                >
                  {nav.active
                    ? React.createElement(
                        nav.activeIcon,
                        { size: "1.8rem" },
                        null
                      )
                    : React.createElement(nav.icon, { size: "1.8rem" }, null)}

                  {nav.active ? (
                    <p className="ml-4 text-lg">
                      <b>{nav.name}</b>
                    </p>
                  ) : (
                    <p className="ml-4 text-lg">{nav.name}</p>
                  )}
                </a>
              </li>
            </Link>
          ))}
        </ul>
        <button
          className={`group mt-1.5 flex w-fit cursor-pointer items-center rounded-full py-2.5 pl-3 pr-7 transition-colors duration-200 hover:bg-gray-200`}
        >
          <HiOutlineDotsCircleHorizontal size="1.8rem" />
          <p className="ml-4 text-lg">More</p>
        </button>
        <button className="mt-6 flex h-12 items-center justify-center rounded-full bg-primary transition-colors duration-200 hover:bg-primaryDark">
          <p className="px-20 text-lg font-bold text-white">Tweet</p>
        </button>
      </div>

      <button className="mb-3 flex items-center justify-between rounded-full p-3 text-sm transition-colors duration-200 hover:bg-gray-200">
        <div className="flex">
          <img
            src="https://pbs.twimg.com/profile_images/1456966702491750400/tzgxEIkX_normal.jpg"
            className="w-10 rounded-full"
          />
          <div className="ml-3 text-start">
            <p>
              <b>ilhan</b>
            </p>
            <p className="text-gray-500">@illhanozkan</p>
          </div>
        </div>

        <HiOutlineDotsHorizontal size="1.2rem" />
      </button>
    </div>
  );
};

export default Sidebar;
