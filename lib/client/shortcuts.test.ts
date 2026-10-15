// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { readShortcutsEnabled, saveShortcutsEnabled } from "./shortcuts";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("single-key shortcuts setting", () => {
  it("is on by default and remembers being turned off", () => {
    expect(readShortcutsEnabled()).toBe(true);
    saveShortcutsEnabled(false);
    expect(window.localStorage.getItem("shortcuts")).toBe("off");
    expect(readShortcutsEnabled()).toBe(false);
    saveShortcutsEnabled(true);
    expect(readShortcutsEnabled()).toBe(true);
  });

  it("keeps the choice for the page when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    saveShortcutsEnabled(false);
    expect(readShortcutsEnabled()).toBe(false);
    saveShortcutsEnabled(true);
  });
});
