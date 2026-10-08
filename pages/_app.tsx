import type { AppProps } from "next/app";
import Head from "next/head";
import { Provider } from "react-redux";

import AppShell from "../components/layout/AppShell";
import type { PageStateProps } from "../lib/server/pageState";
import { useStore } from "../store";
import "../styles/globals.css";

export default function App({
  Component,
  pageProps,
}: AppProps<Partial<PageStateProps>>) {
  const store = useStore(pageProps.initialState);

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
