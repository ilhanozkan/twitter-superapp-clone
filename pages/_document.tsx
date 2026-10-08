import { Head, Html, Main, NextScript } from "next/document";

import { THEME_SCRIPT } from "../lib/client/theme";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="theme-color" content="#ffffff" />
        {/* Sets data-theme before the first paint, so dark mode never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
