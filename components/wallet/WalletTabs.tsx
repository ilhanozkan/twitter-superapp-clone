import Link from "next/link";

export type WalletTab = "activity" | "requests";

/** `?tab=requests` (where request notifications link) or the default, Activity. */
export const walletTab = (value: unknown): WalletTab =>
  value === "requests" ? "requests" : "activity";

const TABS: { id: WalletTab; label: string; href: string }[] = [
  { id: "activity", label: "Activity", href: "/wallet" },
  { id: "requests", label: "Requests", href: "/wallet?tab=requests" },
];

/**
 * Activity | Requests, as links like a profile's tabs: each has its own
 * URL. They route shallowly, since the page already holds both lists.
 */
export default function WalletTabs({ tab }: { tab: WalletTab }) {
  return (
    <nav aria-label="Wallet history" className="flex border-b border-line">
      {TABS.map((item) => {
        const active = item.id === tab;
        return (
          <Link
            key={item.id}
            href={item.href}
            shallow
            scroll={false}
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
