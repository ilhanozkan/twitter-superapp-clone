import Link from "next/link";

import { IBusiness } from "../../types/Business";
import Avatar from "../common/Avatar";
import { revealFocusedItem } from "../common/revealFocusedItem";
import { BusinessTab, businessPath } from "./paths";

/**
 * The businesses the viewer runs, as links (a select that navigated on
 * change would move people elsewhere as they browse it). Shown only when
 * there is more than one.
 */
export default function BusinessSwitcher({
  businesses,
  current,
  tab,
}: {
  businesses: Pick<IBusiness, "username" | "fullname" | "image">[];
  current: string;
  tab: BusinessTab;
}) {
  if (businesses.length < 2) return null;
  const first = businesses[0].username;

  return (
    <nav aria-label="Your businesses" className="border-b border-line">
      <ul
        onFocus={revealFocusedItem}
        className="flex gap-2 overflow-x-auto px-4 py-3"
      >
        {businesses.map((business) => {
          const active =
            business.username.toLowerCase() === current.toLowerCase();
          return (
            <li key={business.username} className="shrink-0">
              <Link
                href={businessPath({
                  business: business.username,
                  tab,
                  defaultBusiness: first,
                })}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-9 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-[15px] font-bold transition-colors ${
                  active
                    ? "border-fg bg-fg text-surface"
                    : "border-line hover:bg-fg/5"
                }`}
              >
                <Avatar user={business} size={28} />
                {business.fullname}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
