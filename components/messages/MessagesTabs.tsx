import Link from "next/link";

/**
 * Chats | Channels, at the top of the inbox and of /channels, while
 * Channels is on.
 */
export default function MessagesTabs({
  current,
}: {
  current: "chats" | "channels";
}) {
  const tabs = [
    { id: "chats", href: "/messages", label: "Chats" },
    { id: "channels", href: "/channels", label: "Channels" },
  ] as const;

  return (
    <nav aria-label="Messages and channels" className="border-b border-line">
      <ul className="flex">
        {tabs.map((tab) => (
          <li key={tab.id} className="flex flex-1">
            {tab.id === current ? (
              <Link
                href={tab.href}
                aria-current="page"
                className="flex flex-1 justify-center py-4 text-[15px] font-bold transition-colors hover:bg-fg/5"
              >
                <span className="border-b-4 border-primary pb-3.5">
                  {tab.label}
                </span>
              </Link>
            ) : (
              <Link
                href={tab.href}
                className="flex flex-1 justify-center py-4 text-[15px] font-medium text-muted transition-colors hover:bg-fg/5"
              >
                {tab.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
