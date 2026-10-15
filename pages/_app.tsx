import type { AppProps } from "next/app";
import Head from "next/head";
import Router from "next/router";
import { useEffect, useMemo } from "react";
import { Provider } from "react-redux";

import AppShell from "../components/layout/AppShell";
import type { PageStateProps } from "../lib/server/pageState";
import { setHistoryNavigation, useStore } from "../store";
import "../styles/globals.css";
import type { NextPageWithShell, PageShell } from "../types/PageShell";

const DESCRIPTION = "A Twitter clone on its way to becoming a SuperApp.";
// Absolute URLs are required for link previews; set NEXT_PUBLIC_SITE_URL in production.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export default function App({
  Component,
  pageProps,
}: AppProps<Partial<PageStateProps> & { shell?: PageShell }>) {
  const store = useStore(pageProps.initialState);
  // A page's static shell, adjusted per request by getServerSideProps (e.g.
  // focus mode for a draft conversation on a page that is otherwise a list).
  const pageShell = (Component as NextPageWithShell).shell;
  const shell = useMemo(
    () => (pageProps.shell ? { ...pageShell, ...pageProps.shell } : pageShell),
    [pageShell, pageProps.shell]
  );

  // Tell the store when a navigation is Back/Forward (see restoreTimelines).
  useEffect(() => {
    const reset = () => setHistoryNavigation(false);
    Router.beforePopState(() => {
      setHistoryNavigation(true);
      return true;
    });
    Router.events.on("routeChangeComplete", reset);
    Router.events.on("routeChangeError", reset);
    Router.events.on("hashChangeComplete", reset);
    return () => {
      Router.beforePopState(() => true);
      Router.events.off("routeChangeComplete", reset);
      Router.events.off("routeChangeError", reset);
      Router.events.off("hashChangeComplete", reset);
    };
  }, []);

  return (
    <Provider store={store}>
      <Head>
        <title>Twitter SuperApp</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="description" content={DESCRIPTION} key="description" />
        {/* No site-wide og:title/og:description: link previews fall back to
            each page's own <title> and description (a tweet, a profile). */}
        <meta property="og:site_name" content="Twitter SuperApp" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        {SITE_URL && (
          <meta property="og:image" content={`${SITE_URL}/og.png`} />
        )}
      </Head>
      {/* The page's shell adjusts the chrome (types/PageShell.ts). */}
      <AppShell shell={shell}>
        <Component {...pageProps} />
      </AppShell>
    </Provider>
  );
}
