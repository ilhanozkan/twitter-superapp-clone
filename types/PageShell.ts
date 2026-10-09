import type { NextPage } from "next";

export interface PageShell {
  /** "wide": from 1024px, hide the right column and grow <main> to 990px. */
  layout?: "default" | "wide";
  /** Phones: hide the bottom tab bar (focus mode) and/or the compose button. */
  hideMobileNav?: boolean;
  hideComposeButton?: boolean;
}

export type NextPageWithShell<P = object> = NextPage<P> & {
  shell?: PageShell;
};
