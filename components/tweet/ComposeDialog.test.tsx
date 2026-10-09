// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { openCompose } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import ComposeDialog from "./ComposeDialog";

const attachment = { type: "product" as const, productId: "seed-p-kk-latte" };

function postedBody() {
  const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(
        JSON.stringify({
          tweet: {
            id: "t1",
            text: "x",
            image: null,
            createdAt: new Date().toISOString(),
            author: testViewer,
            stats: { replies: 0, retweets: 0, likes: 0, tips: 0 },
            viewer: {
              liked: false,
              retweeted: false,
              bookmarked: false,
              tipped: false,
            },
            attachment: null,
          },
        }),
        { status: 201 }
      )
  );
  vi.stubGlobal("fetch", fetch);
  return async () => {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return JSON.parse(fetch.mock.calls[0][1]?.body as string);
  };
}

function renderDialog(features: IFeatures) {
  const { store } = renderWithStore(<ComposeDialog />, {
    state: {
      session: sessionState({ viewer: testViewer, readOnly: false, features }),
    },
  });
  act(() => {
    store.dispatch(
      openCompose({ text: "Just had the Pistachio latte ☕", attachment })
    );
  });
  return store;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ComposeDialog prefill", () => {
  it("starts with the prefilled text and posts the attached product", async () => {
    const body = postedBody();
    const store = renderDialog(featuresWith("shop"));

    expect(screen.getByLabelText("Tweet text")).toHaveProperty(
      "value",
      "Just had the Pistachio latte ☕"
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tweet" }));
    expect(await body()).toEqual({
      text: "Just had the Pistachio latte ☕",
      image: null,
      attachment,
    });
    await waitFor(() => expect(store.getState().ui.composeOpen).toBe(false));
    expect(store.getState().ui.composePrefill).toBeNull();
  });

  it("drops the attachment while the shop is off", async () => {
    const body = postedBody();
    renderDialog(featuresWith());
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tweet" }));
    expect(await body()).toEqual({
      text: "Just had the Pistachio latte ☕",
      image: null,
    });
  });
});
