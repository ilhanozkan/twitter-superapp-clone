import { useRouter } from "next/router";
import { ReactNode } from "react";
import {
  HiArrowLeft,
  HiOutlineEnvelope,
  HiOutlineQueueList,
  HiOutlineUser,
} from "react-icons/hi2";

import { useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import Menu from "../common/Menu";
import { useMoreMenuItems } from "./moreMenuItems";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Show a back arrow (to the previous page, or home when there is none). */
  back?: boolean;
  children?: ReactNode;
}

/** The sticky title bar at the top of the main column; its title is the page's h1. */
export default function PageHeader({
  title,
  subtitle,
  back = false,
  children,
}: PageHeaderProps) {
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const moreItems = useMoreMenuItems();

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex min-h-[53px] items-center gap-6 px-4">
        {/* Phones have no sidebar: the avatar opens what it would hold. */}
        {!back && viewer && (
          <div className="-my-1.5 -ml-1.5 -mr-3.5 xs:hidden">
            <Menu
              label={`${viewer.fullname} @${viewer.username}, account menu`}
              align="left"
              triggerClassName="block rounded-full p-1.5"
              trigger={<Avatar user={viewer} size={32} />}
              items={[
                {
                  label: "Profile",
                  icon: <HiOutlineUser />,
                  onSelect: () => router.push(`/${viewer.username}`),
                },
                {
                  label: "Lists",
                  icon: <HiOutlineQueueList />,
                  onSelect: () => router.push(`/${viewer.username}/lists`),
                },
                {
                  label: "Messages",
                  icon: <HiOutlineEnvelope />,
                  onSelect: () => router.push("/messages"),
                },
                ...moreItems,
              ]}
            />
          </div>
        )}
        {back && (
          <button
            type="button"
            aria-label="Back"
            onClick={goBack}
            className="-ml-2 rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
          >
            <HiArrowLeft aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0 py-1">
          <h1 className="truncate text-xl font-bold leading-6">{title}</h1>
          {subtitle && (
            <p className="truncate text-[13px] text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
