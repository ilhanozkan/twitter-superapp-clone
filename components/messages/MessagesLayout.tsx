import { ReactNode } from "react";

interface MessagesLayoutProps {
  inbox: ReactNode;
  /** The right pane: a conversation, a draft, or "Select a message". */
  children: ReactNode;
  /** What shows below 1024px, where there is room for one pane. */
  show: "inbox" | "conversation";
  /**
   * Phones: whether the tab bar stays under the conversation. Focus mode
   * hides it; a page whose shell can't (a draft at /messages?to=) keeps
   * the conversation above it.
   */
  tabBar?: boolean;
}

/**
 * Messages' two panes from 1024px: a 390px list and the conversation, each
 * scrolling on its own in a full-height grid. Below that, one of them.
 */
export default function MessagesLayout({
  inbox,
  children,
  show,
  tabBar = false,
}: MessagesLayoutProps) {
  const conversationHeight = tabBar
    ? "h-[calc(100dvh-53px-env(safe-area-inset-bottom))] xs:h-dvh"
    : "h-[calc(100dvh-env(safe-area-inset-bottom))] xs:h-dvh";
  // AppShell leaves 9rem under a phone page with the tab bar (the bar and
  // the compose button). A conversation ends at the bar (53px), so it takes
  // back the rest rather than let the page scroll past its composer.
  const phoneFit =
    show === "conversation" && tabBar ? "-mb-[calc(9rem-53px)] xs:mb-0" : "";

  return (
    <div
      className={`lg:grid lg:h-dvh lg:grid-cols-[390px_minmax(0,1fr)] ${phoneFit}`}
    >
      <div
        className={`${show === "inbox" ? "flex" : "hidden"} min-w-0 flex-col lg:flex lg:min-h-0 lg:border-r lg:border-line`}
      >
        {inbox}
      </div>
      <div
        className={`${show === "conversation" ? `flex ${conversationHeight}` : "hidden"} min-w-0 flex-col lg:flex lg:h-auto lg:min-h-0`}
      >
        {children}
      </div>
    </div>
  );
}
