import { useEffect, useLayoutEffect } from "react";

/** useLayoutEffect in the browser; useEffect on the server, where neither runs. */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
