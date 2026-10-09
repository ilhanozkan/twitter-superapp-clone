import dynamic from "next/dynamic";
import { ReactNode, useEffect, useMemo } from "react";

import { fetchSession } from "../../slices/sessionSlice";
import { fetchTrends } from "../../slices/trendsSlice";
import { fetchWallet } from "../../slices/walletSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { PageShell } from "../../types/PageShell";
import Toaster from "../common/Toaster";
import DisplayDialog from "../settings/DisplayDialog";
import ShortcutsDialog from "../settings/ShortcutsDialog";
import ComposeDialog from "../tweet/ComposeDialog";
import MobileNav from "./MobileNav";
import RightBar from "./RightBar";
import RouteProgress from "./RouteProgress";
import { DEFAULT_SHELL, ShellContext } from "./shell";
import Sidebar from "./Sidebar";
import { useActivityPolling } from "./useActivityPolling";
import useGlobalShortcuts from "./useGlobalShortcuts";
import useThemeSync from "./useThemeSync";

// Each lane's global dialogs (§12.3), loaded on demand so they stay out of
// every page's first bundle.
const WalletDialogs = dynamic(() => import("../wallet/WalletDialogs"), {
  ssr: false,
});
const MessageDialogs = dynamic(() => import("../messages/MessageDialogs"), {
  ssr: false,
});
const OrderDialogs = dynamic(() => import("../orders/OrderDialogs"), {
  ssr: false,
});
const StoryDialogs = dynamic(() => import("../stories/StoryDialogs"), {
  ssr: false,
});

/** Room under the content on phones for what floats over its end. */
function phonePadding({ hideMobileNav, hideComposeButton }: PageShell) {
  if (!hideMobileNav) return "pb-[calc(9rem+env(safe-area-inset-bottom))]";
  if (!hideComposeButton)
    return "pb-[calc(5.5rem+env(safe-area-inset-bottom))]";
  return "pb-[env(safe-area-inset-bottom)]";
}

/** Status changes of orders and rides in progress, read out politely. */
function LiveActivityAnnouncer() {
  const announcement = useAppSelector((state) => state.activity.announcement);
  return (
    <p aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );
}

/**
 * Sidebar, main column and right bar, kept mounted across page navigations.
 * Layout follows Twitter's breakpoints: full sidebar from 1280px, icon rail
 * below, right bar from 1024px, and a bottom tab bar on phones (< 500px).
 * Pages adjust it through their static `shell` (types/PageShell.ts): wide
 * pages drop the right bar for a 990px main column from 1024px.
 */
export default function AppShell({
  children,
  shell: pageShell,
}: {
  children: ReactNode;
  shell?: PageShell;
}) {
  const dispatch = useAppDispatch();
  const hasViewer = useAppSelector((state) => !!state.session.viewer);
  const trendsLoaded = useAppSelector((state) => state.trends.loaded);
  const walletOn = useAppSelector((state) => state.session.features.wallet);
  const walletLoaded = useAppSelector((state) => state.wallet.loaded);
  const shell = useMemo(
    () => ({ ...DEFAULT_SHELL, ...pageShell }),
    [pageShell]
  );
  const wide = shell.layout === "wide";

  useGlobalShortcuts();
  useThemeSync();
  useActivityPolling();

  // Static pages (404, 500) have no server props: load the basics here.
  // The thunks skip themselves when the data is loaded or already loading.
  useEffect(() => {
    if (!hasViewer) dispatch(fetchSession());
    if (!trendsLoaded) dispatch(fetchTrends());
  }, [dispatch, hasViewer, trendsLoaded]);

  useEffect(() => {
    if (walletOn && !walletLoaded) dispatch(fetchWallet());
  }, [dispatch, walletOn, walletLoaded]);

  return (
    <ShellContext.Provider value={shell}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:font-bold focus:shadow-menu"
      >
        Skip to main content
      </a>
      <RouteProgress />

      <div className="mx-auto flex min-h-screen max-w-[1265px] justify-center">
        <header className="sticky top-0 hidden h-screen w-[72px] shrink-0 xs:block sm:w-[88px] xl:w-[275px]">
          <Sidebar />
        </header>

        <main
          id="main"
          tabIndex={-1}
          // On phones, room to scroll the last item clear of the tab bar and
          // the floating compose button.
          className={`min-h-screen w-full min-w-0 max-w-feed focus:outline-none xs:border-x xs:border-line xs:pb-0 ${phonePadding(shell)} ${
            wide ? "lg:max-w-[990px]" : ""
          }`}
        >
          {children}
        </main>

        <aside
          aria-label="Search and trends"
          className={
            wide
              ? "hidden"
              : "hidden w-[290px] shrink-0 pl-6 lg:block xl:w-[350px] xl:pl-8"
          }
        >
          <RightBar />
        </aside>
      </div>

      <MobileNav />
      <ComposeDialog />
      <DisplayDialog />
      <ShortcutsDialog />
      <WalletDialogs />
      <MessageDialogs />
      <OrderDialogs />
      <StoryDialogs />
      <LiveActivityAnnouncer />
      <Toaster />
    </ShellContext.Provider>
  );
}
