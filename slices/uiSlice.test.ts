import { describe, expect, it, vi } from "vitest";

import { initializeStore } from "../store";
import reducer, { dismissToast, showToast } from "./uiSlice";

describe("toasts", () => {
  it("keeps the three most recent and can dismiss one", () => {
    let state = reducer(undefined, { type: "init" });
    for (const message of ["a", "b", "c", "d"]) {
      state = reducer(state, showToast({ message }));
    }
    expect(state.toasts.map((toast) => toast.message)).toEqual(["b", "c", "d"]);

    state = reducer(state, dismissToast(state.toasts[0].id));
    expect(state.toasts.map((toast) => toast.message)).toEqual(["c", "d"]);
  });

  it("shows a toast from a page the user already left on the current page", () => {
    vi.stubGlobal("window", {});
    const before = initializeStore({
      session: { viewer: null, readOnly: false },
    });
    const after = initializeStore({
      session: { viewer: null, readOnly: true },
    });

    before.dispatch(showToast({ message: "Couldn't like that Tweet" }));
    expect(after.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Couldn't like that Tweet",
    ]);
    vi.unstubAllGlobals();
  });
});
