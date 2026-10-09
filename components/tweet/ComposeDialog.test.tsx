// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { openCompose } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import { TweetAttachmentInput } from "../../types/Tweet";
import ComposeDialog from "./ComposeDialog";

// A stand-in for the shop lane's slot, to see what the dialog hands it (the
// real picker may fetch the attached product).
vi.mock("../shop/ComposerProductPicker", () => ({
  default: ({ attachment }: { attachment: TweetAttachmentInput | null }) => (
    <p>Attached {attachment?.productId ?? "nothing"}</p>
  ),
}));

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
  const posted = () =>
    fetch.mock.calls.find(([, init]) => init?.method === "POST");
  return async () => {
    await waitFor(() => expect(posted()).toBeDefined());
    return JSON.parse(posted()![1]!.body as string);
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
    expect(screen.getByText("Attached seed-p-kk-latte")).toBeTruthy();
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
    expect(screen.queryByText(/^Attached/)).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tweet" }));
    expect(await body()).toEqual({
      text: "Just had the Pistachio latte ☕",
      image: null,
    });
  });
});
