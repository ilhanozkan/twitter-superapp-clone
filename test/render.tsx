import { render, RenderOptions } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { ReactElement } from "react";
import { Provider } from "react-redux";
import { vi } from "vitest";

import { NO_FEATURES } from "../lib/superapp/features";
import { sessionState } from "../slices/sessionSlice";
import { InitialState, makeStore } from "../store";
import { IFeatures } from "../types/Superapp";

export const testViewer = {
  username: "illlhanozkan",
  fullname: "Ilhan Ozkan",
  image: null,
};

/** Features with only the given ones on. */
export const featuresWith = (...on: (keyof IFeatures)[]): IFeatures => ({
  ...NO_FEATURES,
  ...Object.fromEntries(on.map((id) => [id, true])),
});

// jsdom has <dialog> but not its modal API: open and close it by attribute.
function installDialogPolyfill() {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal === "function") return;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

export function mockRouter(overrides: Partial<NextRouter> = {}): NextRouter {
  const path = overrides.asPath ?? "/";
  return {
    basePath: "",
    pathname: path.split(/[?#]/)[0],
    route: path.split(/[?#]/)[0],
    query: {},
    asPath: path,
    isLocaleDomain: false,
    isReady: true,
    isPreview: false,
    isFallback: false,
    push: vi.fn(async () => true),
    replace: vi.fn(async () => true),
    reload: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(async () => {}),
    beforePopState: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    ...overrides,
  };
}

interface RenderWithStoreOptions extends Omit<RenderOptions, "wrapper"> {
  /** Store state; the session defaults to the demo viewer with nothing on. */
  state?: InitialState;
  /** The current URL, e.g. "/wallet". */
  path?: string;
}

/**
 * Renders a component as the app does: inside the Redux store and a Next
 * router (pages router) at `path`. Returns the store and router to assert on.
 */
export function renderWithStore(
  ui: ReactElement,
  { state = {}, path = "/", ...options }: RenderWithStoreOptions = {}
) {
  installDialogPolyfill();
  const store = makeStore({
    session: sessionState({ viewer: testViewer, readOnly: false }),
    ...state,
  });
  const router = mockRouter({ asPath: path });
  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <RouterContext.Provider value={router}>
        <Provider store={store}>{children}</Provider>
      </RouterContext.Provider>
    ),
  });
  return { ...result, store, router };
}
