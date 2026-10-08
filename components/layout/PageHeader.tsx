import { useRouter } from "next/router";
import { ReactNode } from "react";
import { HiArrowLeft } from "react-icons/hi2";

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

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex min-h-[53px] items-center gap-6 px-4">
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
