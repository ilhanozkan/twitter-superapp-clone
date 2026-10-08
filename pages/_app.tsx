import type { AppProps } from "next/app";
import Head from "next/head";
import Router from "next/router";
import { useEffect } from "react";
import { Provider } from "react-redux";

import AppShell from "../components/layout/AppShell";
import type { PageStateProps } from "../lib/server/pageState";
import { setHistoryNavigation, useStore } from "../store";
import "../styles/globals.css";

export default function App({
  Component,
  pageProps,
}: AppProps<Partial<PageStateProps>>) {
  const store = useStore(pageProps.initialState);

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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="A Twitter clone on its way to becoming a SuperApp."
        />
      </Head>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </Provider>
  );
}
