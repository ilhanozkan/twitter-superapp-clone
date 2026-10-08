export type ThemePreference = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const THEME_COLORS: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#000000",
};

/**
 * Runs in <head> before the first paint so the page never flashes the wrong
 * theme. Keep it in sync with readThemePreference/resolveTheme below.
 */
export const THEME_SCRIPT = `(function(){try{var p=null;try{p=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=d?"dark":"light";document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"${THEME_COLORS.dark}":"${THEME_COLORS.light}")}catch(e){}})();`;

// Used when storage is unavailable (private mode), for this page's lifetime.
let memoryPreference: ThemePreference = "system";

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return memoryPreference;
  }
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
}

export function saveThemePreference(preference: ThemePreference) {
  memoryPreference = preference;
  try {
    if (preference === "system")
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage disabled: memoryPreference keeps the choice for this page.
  }
  applyTheme(preference);
}
