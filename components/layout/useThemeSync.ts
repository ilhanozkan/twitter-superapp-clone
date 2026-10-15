import { useEffect } from "react";

import {
  applyTheme,
  readThemePreference,
  THEME_STORAGE_KEY,
} from "../../lib/client/theme";

/**
 * Keeps the theme current: "Automatic" follows the device when it switches
 * light/dark, and a choice made in another tab applies here too.
 */
export default function useThemeSync() {
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");

    const onSystemChange = () => {
      if (readThemePreference() === "system") applyTheme("system");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyTheme(readThemePreference());
      }
    };

    media?.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media?.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
}
