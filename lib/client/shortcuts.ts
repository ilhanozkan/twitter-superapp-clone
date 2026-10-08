// Single-key shortcuts can be turned off (WCAG 2.1.4): speech input and
// mistyped keys would otherwise trigger them.
export const SHORTCUTS_STORAGE_KEY = "shortcuts";

// Used when storage is unavailable (private mode), for this page's lifetime.
let memoryEnabled = true;

export function readShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return memoryEnabled;
  }
}

export function saveShortcutsEnabled(enabled: boolean) {
  memoryEnabled = enabled;
  try {
    if (enabled) window.localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
    else window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, "off");
  } catch {
    // Storage disabled: memoryEnabled keeps the choice for this page.
  }
}
