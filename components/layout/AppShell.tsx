import { ReactNode, useEffect } from "react";

import { fetchSession } from "../../slices/sessionSlice";
import { fetchTrends } from "../../slices/trendsSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import ComposeDialog from "../tweet/ComposeDialog";
import RightBar from "./RightBar";
import Sidebar from "./Sidebar";

/** Sidebar, main column and right bar, kept mounted across page navigations. */
export default function AppShell({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const hasViewer = useAppSelector((state) => !!state.session.viewer);
  const trendsLoaded = useAppSelector((state) => state.trends.loaded);

  // Static pages (404, 500) have no server props: load the basics here.
  // The thunks skip themselves when the data is loaded or already loading.
  useEffect(() => {
    if (!hasViewer) dispatch(fetchSession());
    if (!trendsLoaded) dispatch(fetchTrends());
  }, [dispatch, hasViewer, trendsLoaded]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1265px] justify-center">
      <header className="sticky top-0 h-screen w-[275px] shrink-0">
        <Sidebar />
      </header>

      <main
        id="main"
        className="min-h-screen w-full max-w-feed border-x border-line"
      >
        {children}
      </main>

      <aside aria-label="Search and trends" className="w-[350px] shrink-0 pl-8">
        <RightBar />
      </aside>

      <ComposeDialog />
    </div>
  );
}
