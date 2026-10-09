import { useRouter } from "next/router";
import { ReactNode } from "react";
import { HiArrowLeft } from "react-icons/hi2";

import LiveActivityBanner from "../superapp/LiveActivityBanner";
import AccountMenu from "./AccountMenu";
import { useShell } from "./shell";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Show a back arrow (to the previous page, or home when there is none). */
  back?: boolean;
  /** Buttons at the end of the title row, e.g. "Send credits" in a chat. */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * The sticky title bar at the top of the main column; its title is the
 * page's h1. Where there is no right column (below 1024px, or on wide
 * pages) it also shows what is in progress (live activity) under the title.
 */
export default function PageHeader({
  title,
  subtitle,
  back = false,
  actions,
  children,
}: PageHeaderProps) {
  const router = useRouter();
  const { layout } = useShell();

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex min-h-[53px] items-center gap-6 px-4">
        {!back && <AccountMenu />}
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
        <div className="min-w-0 flex-1 py-1">
          <h1 className="truncate text-xl font-bold leading-6">{title}</h1>
          {subtitle && (
            <p className="truncate text-[13px] text-muted">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="-mr-2 flex shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
      </div>
      {children}
      <LiveActivityBanner className={layout === "wide" ? "" : "lg:hidden"} />
    </div>
  );
}
