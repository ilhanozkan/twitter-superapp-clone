import { createContext, useContext } from "react";

import { PageShell } from "../../types/PageShell";

export const DEFAULT_SHELL: Required<PageShell> = {
  layout: "default",
  hideMobileNav: false,
  hideComposeButton: false,
};

/** The current page's shell options (its static `Page.shell`), for the chrome. */
export const ShellContext = createContext<Required<PageShell>>(DEFAULT_SHELL);

export const useShell = () => useContext(ShellContext);
