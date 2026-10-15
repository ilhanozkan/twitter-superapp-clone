import { ReactNode } from "react";

interface MessagesLayoutProps {
  inbox: ReactNode;
  /** The right pane: a conversation, a draft, or "Select a message". */
  children: ReactNode;
  /**
   * What shows below 1024px, where there is room for one pane. A
   * conversation is in focus mode there (no tab bar): it fills the screen.
   */
  show: "inbox" | "conversation";
}

/**
 * Messages' two panes from 1024px: a 390px list and the conversation, each
 * scrolling on its own in a full-height grid. Below that, one of them.
 */
export default function MessagesLayout({
  inbox,
  children,
  show,
}: MessagesLayoutProps) {
  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[390px_minmax(0,1fr)]">
      <div
        className={`${show === "inbox" ? "flex" : "hidden"} min-w-0 flex-col lg:flex lg:min-h-0 lg:border-r lg:border-line`}
      >
        {inbox}
      </div>
      <div
        className={`${show === "conversation" ? "flex h-[calc(100dvh-env(safe-area-inset-bottom))] xs:h-dvh" : "hidden"} min-w-0 flex-col lg:flex lg:h-auto lg:min-h-0`}
      >
        {children}
      </div>
    </div>
  );
}
