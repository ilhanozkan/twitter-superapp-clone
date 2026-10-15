import Link from "next/link";
import { RiQuillPenLine } from "react-icons/ri";

import { openCompose } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { navItems, useCurrentPath } from "./Navigation";

const MOBILE_ITEMS = [
  "Home",
  "Explore",
  "Notifications",
  "Bookmarks",
  "Profile",
];

/** Phones (below 500px): a bottom tab bar and a floating compose button. */
export default function MobileNav() {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const path = useCurrentPath();
  const items = navItems(viewer?.username ?? null).filter((item) =>
    MOBILE_ITEMS.includes(item.label)
  );

  return (
    <>
      {!readOnly && (
        <button
          type="button"
          aria-label="Compose a Tweet"
          onClick={() => dispatch(openCompose())}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary-fill text-2xl text-white shadow-lg transition-colors hover:bg-primary-fill-hover xs:hidden"
        >
          <RiQuillPenLine aria-hidden="true" />
        </button>
      )}

      <nav
        aria-label="Primary"
        // Clear of the iPhone home indicator (the viewport uses viewport-fit=cover).
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md xs:hidden"
      >
        <ul className="flex h-[53px] items-stretch justify-around">
          {items.map((item) => {
            const active = item.isActive(path);
            const Icon = active ? item.activeIcon : item.icon;
            return (
              <li key={item.label} className="flex flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-1 items-center justify-center text-[26px]"
                >
                  <Icon aria-hidden="true" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
