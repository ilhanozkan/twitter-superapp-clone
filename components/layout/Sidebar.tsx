import Link from "next/link";
import { useRouter } from "next/router";
import { BsTwitter } from "react-icons/bs";
import { HiOutlineDotsCircleHorizontal } from "react-icons/hi";
import { HiEllipsisHorizontal, HiOutlineUser } from "react-icons/hi2";
import { RiQuillPenLine } from "react-icons/ri";

import { openCompose } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import Menu from "../common/Menu";
import { useMoreMenuItems } from "./moreMenuItems";
import Navigation from "./Navigation";

export default function Sidebar() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const moreItems = useMoreMenuItems();

  return (
    <div className="flex h-full flex-col items-center justify-between overflow-y-auto px-2 pb-3 xl:items-stretch">
      <div className="flex w-full flex-col items-center xl:items-stretch">
        <Link
          href="/"
          aria-label="Twitter SuperApp home"
          className="my-0.5 inline-flex self-center rounded-full p-3 text-[30px] text-brand transition-colors duration-200 hover:bg-brand/10 xl:self-start"
        >
          <BsTwitter aria-hidden="true" />
        </Link>

        <Navigation />

        <Menu
          label="More"
          align="left"
          placement="above"
          strategy="fixed"
          triggerClassName="group flex w-full justify-center py-1 text-left xl:justify-start"
          trigger={
            <span className="flex items-center gap-5 rounded-full p-3 transition-colors duration-200 group-hover:bg-fg/10 xl:pr-6">
              <HiOutlineDotsCircleHorizontal
                aria-hidden="true"
                className="text-[26px]"
              />
              <span className="sr-only text-xl xl:not-sr-only">More</span>
            </span>
          }
          items={moreItems}
        />

        {!readOnly && (
          <button
            type="button"
            onClick={() => dispatch(openCompose())}
            className="mt-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary-fill text-white shadow-sm transition-colors duration-200 hover:bg-primary-fill-hover xl:w-[90%]"
          >
            <RiQuillPenLine aria-hidden="true" className="text-2xl xl:hidden" />
            <span className="sr-only text-[17px] font-bold xl:not-sr-only">
              Tweet
            </span>
          </button>
        )}
      </div>

      {viewer && (
        <Menu
          label={`${viewer.fullname} @${viewer.username}, account menu`}
          align="left"
          placement="above"
          strategy="fixed"
          triggerClassName="flex w-full items-center justify-center gap-3 rounded-full p-3 text-left transition-colors duration-200 hover:bg-fg/10 xl:justify-start"
          trigger={
            <>
              <Avatar user={viewer} />
              <span className="hidden min-w-0 flex-1 leading-5 xl:block">
                <span className="block truncate text-[15px] font-bold">
                  {viewer.fullname}
                </span>
                <span className="block truncate text-[15px] text-muted">
                  @{viewer.username}
                </span>
              </span>
              <HiEllipsisHorizontal
                aria-hidden="true"
                className="hidden text-lg xl:block"
              />
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
