// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IProduct } from "../../types/Shop";
import ComposeDialog from "../tweet/ComposeDialog";
import Composer from "../tweet/Composer";
import { card, product, stubFetch, tweet } from "./testing";

// The picker inside the real composer, whose toolbar is its only slot: the
// preview must land above the toolbar, and the posted Tweet must carry it.

const stickers = product({
  id: "seed-p-sa-stickers",
  business: "superapp",
  name: "Sticker pack",
  price: 300,
  image: "/media/menu/stickers.svg",
  imageAlt: "A sheet of stickers",
});
const mug = product({
  id: "seed-p-sa-mug",
  business: "superapp",
  name: "SuperApp mug",
  price: 1_200,
});
const stickersCard = card(
  {
    id: stickers.id,
    name: "Sticker pack",
    price: 300,
    image: stickers.image,
    imageAlt: stickers.imageAlt,
  },
  { username: "superapp", fullname: "Twitter SuperApp", etaMinutes: [180, 183] }
);

function setup({
  attachable = [stickers, mug],
  prefill,
  inDialog = false,
}: { attachable?: IProduct[]; prefill?: string; inDialog?: boolean } = {}) {
  const api = stubFetch({
    "/api/products/attachable": () => [200, { items: attachable }],
    [`/api/products/${stickers.id}`]: () => [
      200,
      { product: stickers, card: stickersCard },
    ],
    "/api/tweets": (init) => [
      201,
      {
        tweet: {
          ...tweet({ type: "product", product: stickersCard }),
          text: JSON.parse(String(init?.body)).text,
        },
      },
    ],
  });
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const result = renderWithStore(
    inDialog ? (
      <ComposeDialog />
    ) : (
      <Composer
        prefill={
          prefill
            ? {
                text: "Look",
                attachment: { type: "product", productId: prefill },
              }
            : null
        }
      />
    ),
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features: featuresWith("shop"),
        }),
        ...(inDialog && {
          ui: {
            composeOpen: true,
            composePrefill: null,
            dialog: null,
            dialogArgs: null,
            toasts: [],
          },
        }),
      },
    }
  );
  return { ...result, calls: api.calls };
}

const openPicker = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Attach a product" })
  );
  return screen.getByRole("dialog", { name: "Attach a product" });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ComposerProductPicker", () => {
  it("lists the viewer's products and previews the chosen one above the toolbar", async () => {
    const { calls } = setup();
    const picker = await openPicker();
    await userEvent.click(
      await within(picker).findByRole("button", { name: /Sticker pack/ })
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    const preview = await screen.findByRole("group", {
      name: "Attached product",
    });
    await waitFor(() => expect(preview.textContent).toContain("Sticker pack"));
    expect(preview.textContent).toContain("3.00 credits");
    expect(preview.textContent).toContain(
      "Twitter SuperApp · Open · 180–183 min"
    );

    // Above the toolbar (the row holding the Tweet button), not inside it.
    const toolbar = screen
      .getByRole("button", { name: "Tweet" })
      .closest(".border-t")!;
    expect(toolbar.contains(preview)).toBe(false);
    expect(
      preview.compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(calls.map((call) => call.path)).toContain(
      `/api/products/${stickers.id}`
    );
  });

  it("posts the Tweet with the product", async () => {
    const { calls } = setup();
    await userEvent.type(screen.getByLabelText("Tweet text"), "Stickers!");
    const picker = await openPicker();
    await userEvent.click(
      await within(picker).findByRole("button", { name: /Sticker pack/ })
    );
    await userEvent.click(screen.getByRole("button", { name: "Tweet" }));

    await waitFor(() =>
      expect(calls.some((call) => call.init?.method === "POST")).toBe(true)
    );
    const post = calls.find((call) => call.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({
      text: "Stickers!",
      attachment: { type: "product", productId: stickers.id },
    });
    // The composer starts over without it.
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Attached product" })
      ).toBeNull()
    );
  });

  it("keeps the Compose dialog and its draft when the picker closes", async () => {
    const { store } = setup({ inDialog: true });
    const compose = screen.getByRole("dialog", { name: "Compose Tweet" });
    await userEvent.type(within(compose).getByLabelText("Tweet text"), "Hi");

    let picker = await openPicker();
    await userEvent.click(
      await within(picker).findByRole("button", { name: /Sticker pack/ })
    );
    expect(
      screen.queryByRole("dialog", { name: "Attach a product" })
    ).toBeNull();
    picker = await openPicker();
    await userEvent.click(
      within(picker).getByRole("button", { name: "Close" })
    );

    expect(store.getState().ui.composeOpen).toBe(true);
    expect(screen.getByRole("dialog", { name: "Compose Tweet" })).toBe(compose);
    expect(
      (within(compose).getByLabelText("Tweet text") as HTMLTextAreaElement)
        .value
    ).toBe("Hi");
    expect(
      within(compose).getByRole("group", { name: "Attached product" })
    ).toBeTruthy();
  });

  it("removes the product, keeping focus in the toolbar", async () => {
    setup();
    const picker = await openPicker();
    await userEvent.click(
      await within(picker).findByRole("button", { name: /Sticker pack/ })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Sticker pack" })
    );
    expect(
      screen.queryByRole("group", { name: "Attached product" })
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Attach a product" })
    );
  });

  it("marks the attached product in the list", async () => {
    setup({ prefill: stickers.id });
    const picker = await openPicker();
    const item = await within(picker).findByRole("button", {
      name: /Sticker pack/,
    });
    expect(item.textContent).toContain("(attached)");
    expect(
      within(picker).getByRole("button", { name: /SuperApp mug/ }).textContent
    ).not.toContain("(attached)");
  });

  it("explains where products come from when there are none", async () => {
    setup({ attachable: [] });
    const picker = await openPicker();
    expect(
      await within(picker).findByText(
        "Products from businesses you manage or have ordered from appear here."
      )
    ).toBeTruthy();
    expect(
      within(picker)
        .getByRole("link", { name: "Browse Food" })
        .getAttribute("href")
    ).toBe("/food");
  });

  it("offers a retry when the list can't be loaded", async () => {
    const failing = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "internal", message: "Try again." },
          }),
          { status: 500 }
        )
    );
    setup();
    vi.stubGlobal("fetch", failing);
    const picker = await openPicker();
    expect((await within(picker).findByRole("alert")).textContent).toBe(
      "Try again."
    );
    await userEvent.click(
      within(picker).getByRole("button", { name: "Retry" })
    );
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("previews a product the composer started with, or says it is gone", async () => {
    setup({ prefill: stickers.id });
    const preview = await screen.findByRole("group", {
      name: "Attached product",
    });
    await waitFor(() => expect(preview.textContent).toContain("Sticker pack"));
    cleanup();

    setup({ prefill: "seed-p-deleted" });
    expect(
      await screen.findByText("This item is no longer available")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove the product" })
    ).toBeTruthy();
  });
});
