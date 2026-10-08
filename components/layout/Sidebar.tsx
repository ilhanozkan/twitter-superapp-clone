import Link from "next/link";
import { useRouter } from "next/router";
import { BsTwitter } from "react-icons/bs";
import { HiOutlineDotsCircleHorizontal } from "react-icons/hi";
import {
  HiEllipsisHorizontal,
  HiOutlineCodeBracket,
  HiOutlineUser,
} from "react-icons/hi2";

import { openCompose } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Menu from "../common/Menu";
import Navigation from "./Navigation";

const REPOSITORY_URL = "https://github.com/ilhanozkan/twitter-superapp-clone";

export default function Sidebar() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);

  return (
    <div className="flex h-full flex-col justify-between overflow-y-auto px-2 pb-3">
      <div>
        <Link
          href="/"
          aria-label="Twitter SuperApp home"
          className="my-0.5 inline-flex rounded-full p-3 text-[30px] text-primary transition-colors duration-200 hover:bg-primary/10"
        >
          <BsTwitter aria-hidden="true" />
        </Link>

        <Navigation />

        <Menu
          label="More"
          align="left"
          placement="above"
          triggerClassName="group flex w-full py-1 text-left"
          trigger={
            <span className="flex items-center gap-5 rounded-full p-3 pr-6 transition-colors duration-200 group-hover:bg-fg/10">
              <HiOutlineDotsCircleHorizontal
                aria-hidden="true"
                className="text-[26px]"
              />
              <span className="text-xl">More</span>
            </span>
          }
          items={[
            {
              label: "Source code",
              icon: <HiOutlineCodeBracket />,
              onSelect: () =>
                window.open(REPOSITORY_URL, "_blank", "noopener,noreferrer"),
            },
          ]}
        />

        {!readOnly && (
          <Button
            size="lg"
            className="mt-4 w-[90%]"
            onClick={() => dispatch(openCompose())}
          >
            Tweet
          </Button>
        )}
      </div>

      {viewer && (
        <Menu
          label={`${viewer.fullname} @${viewer.username}, account menu`}
          align="left"
          placement="above"
          triggerClassName="flex w-full items-center gap-3 rounded-full p-3 text-left transition-colors duration-200 hover:bg-fg/10"
          trigger={
            <>
              <Avatar user={viewer} />
              <span className="min-w-0 flex-1 leading-5">
                <span className="block truncate text-[15px] font-bold">
                  {viewer.fullname}
                </span>
                <span className="block truncate text-[15px] text-muted">
                  @{viewer.username}
                </span>
              </span>
              <HiEllipsisHorizontal aria-hidden="true" className="text-lg" />
            </>
          }
          items={[
            {
              label: "View profile",
              icon: <HiOutlineUser />,
              onSelect: () => router.push(`/${viewer.username}`),
            },
          ]}
        />
      )}
    </div>
  );
}
