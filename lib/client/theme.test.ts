// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  THEME_SCRIPT,
} from "./theme";

function mockSystem(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("defaults to following the system", () => {
    mockSystem(true);
    expect(readThemePreference()).toBe("system");
    expect(resolveTheme("system")).toBe("dark");
  });

  it("stores an explicit choice and applies it", () => {
    mockSystem(false);
    saveThemePreference("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    saveThemePreference("system");
    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("the inline script resolves the same theme before React loads", () => {
    mockSystem(true);
    window.localStorage.setItem("theme", "light");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");

    window.localStorage.removeItem("theme");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  describe("with storage blocked (private mode)", () => {
    function blockStorage() {
      const blocked = () => {
        throw new DOMException("blocked", "SecurityError");
      };
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("the inline script still applies the system theme and theme-color", () => {
      mockSystem(true);
      blockStorage();
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#ffffff";
      document.head.append(meta);

      new Function(THEME_SCRIPT)();
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(meta.content).toBe("#000000");
      meta.remove();
    });

    it("keeps an explicit choice for the page", () => {
      mockSystem(false);
      blockStorage();
      saveThemePreference("dark");
      expect(readThemePreference()).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
      saveThemePreference("system");
      expect(readThemePreference()).toBe("system");
    });
  });
});
