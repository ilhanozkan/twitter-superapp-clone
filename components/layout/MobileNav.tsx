import Link from "next/link";
import { RiQuillPenLine } from "react-icons/ri";

import { openCompose } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import {
  NavIcon,
  NavLabel,
  navName,
  useCurrentPath,
  useNavItems,
} from "./Navigation";
import { useShell } from "./shell";

/** The phone tab bar; everything else is in the header's avatar menu. */
export const MOBILE_TABS: NavLabel[] = [
  "Home",
  "Explore",
  "Services",
  "Notifications",
  "Messages",
];

/**
 * Phones (below 500px): a bottom tab bar and a floating compose button.
 * Pages can hide either through their shell (focus mode, money pages).
 */
export default function MobileNav() {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const { hideMobileNav, hideComposeButton } = useShell();
  const path = useCurrentPath();
  const items = useNavItems();
  const tabs = MOBILE_TABS.map((label) =>
    items.find((item) => item.label === label)
  ).filter((item) => item !== undefined);

  return (
    <>
      {!readOnly && !hideComposeButton && (
        <button
          type="button"
          aria-label="Compose a Tweet"
          onClick={() => dispatch(openCompose())}
          className={`fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary-fill text-2xl text-white shadow-lg transition-colors hover:bg-primary-fill-hover xs:hidden ${
            hideMobileNav
              ? "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
              : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
          }`}
        >
          <RiQuillPenLine aria-hidden="true" />
        </button>
      )}

      {!hideMobileNav && (
        <nav
          aria-label="Primary"
          // Clear of the iPhone home indicator (the viewport uses viewport-fit=cover).
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md xs:hidden"
        >
          <ul className="flex h-[53px] items-stretch justify-around">
            {tabs.map((item) => {
              const active = item.isActive(path);
              return (
                <li key={item.label} className="flex flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="flex flex-1 items-center justify-center text-[26px]"
                  >
                    <NavIcon item={item} active={active} />
                    <span className="sr-only">{navName(item)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
