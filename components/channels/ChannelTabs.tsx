import Link from "next/link";

import { ChannelTab } from "../../slices/channelsSlice";
import { channelsTabPath } from "./paths";

const TABS: { id: ChannelTab; label: string }[] = [
  { id: "mine", label: "Your channels" },
  { id: "discover", label: "Discover" },
];

/**
 * Your channels | Discover. Both lists are on the page already, so the
 * tabs only change the URL (shallow), like the profile's tabs look.
 */
export default function ChannelTabs({ tab }: { tab: ChannelTab }) {
  return (
    <nav aria-label="Channel lists" className="flex border-b border-line">
      {TABS.map((item) => {
        const active = item.id === tab;
        return (
          <Link
            key={item.id}
            href={channelsTabPath(item.id)}
            shallow
            scroll={false}
            replace
            aria-current={active ? "page" : undefined}
            className="flex flex-1 justify-center transition-colors hover:bg-fg/10"
          >
            <span
              className={`py-4 text-[15px] ${
                active
                  ? "border-b-4 border-primary pb-3 font-bold"
                  : "font-medium text-muted"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
