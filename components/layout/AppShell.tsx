import { ReactNode, useEffect } from "react";

import { fetchSession } from "../../slices/sessionSlice";
import { fetchTrends } from "../../slices/trendsSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Toaster from "../common/Toaster";
import DisplayDialog from "../settings/DisplayDialog";
import ShortcutsDialog from "../settings/ShortcutsDialog";
import ComposeDialog from "../tweet/ComposeDialog";
import MobileNav from "./MobileNav";
import RightBar from "./RightBar";
import RouteProgress from "./RouteProgress";
import Sidebar from "./Sidebar";
import useGlobalShortcuts from "./useGlobalShortcuts";
import useThemeSync from "./useThemeSync";

/**
 * Sidebar, main column and right bar, kept mounted across page navigations.
 * Layout follows Twitter's breakpoints: full sidebar from 1280px, icon rail
 * below, right bar from 1024px, and a bottom tab bar on phones (< 500px).
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const hasViewer = useAppSelector((state) => !!state.session.viewer);
  const trendsLoaded = useAppSelector((state) => state.trends.loaded);

  useGlobalShortcuts();
  useThemeSync();

  // Static pages (404, 500) have no server props: load the basics here.
  // The thunks skip themselves when the data is loaded or already loading.
  useEffect(() => {
    if (!hasViewer) dispatch(fetchSession());
    if (!trendsLoaded) dispatch(fetchTrends());
  }, [dispatch, hasViewer, trendsLoaded]);

  return (
    <>
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
          className="min-h-screen w-full min-w-0 max-w-feed pb-[calc(9rem+env(safe-area-inset-bottom))] focus:outline-none xs:border-x xs:border-line xs:pb-0"
        >
          {children}
        </main>

        <aside
          aria-label="Search and trends"
          className="hidden w-[290px] shrink-0 pl-6 lg:block xl:w-[350px] xl:pl-8"
        >
          <RightBar />
        </aside>
      </div>

      <MobileNav />
      <ComposeDialog />
      <DisplayDialog />
      <ShortcutsDialog />
      <Toaster />
    </>
  );
}
