// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { sessionState } from "./slices/sessionSlice";
import { AppStore, InitialState, initializeStore, useStore } from "./store";

describe("useStore", () => {
  it("renders with the store that later navigations start from, in StrictMode too", () => {
    const initialState: InitialState = {
      session: sessionState({ viewer: null, readOnly: false }),
    };
    let rendered: AppStore | undefined;
    function Probe() {
      rendered = useStore(initialState);
      return null;
    }

    render(
      <StrictMode>
        <Probe />
      </StrictMode>
    );
    rendered!.dispatch({ type: "ui/openCompose" });

    // The next page's store is built from the one React rendered with.
    const next = initializeStore({
      session: sessionState({ viewer: null, readOnly: true }),
    });
    expect(next.getState().ui.composeOpen).toBe(true);
  });
});
