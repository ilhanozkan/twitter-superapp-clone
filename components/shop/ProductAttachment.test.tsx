// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import { ITweet } from "../../types/Tweet";
import TweetCard from "../tweet/TweetCard";
import ProductAttachment from "./ProductAttachment";
import { card, status, tweet } from "./testing";

function renderCard(
  value: ITweet,
  {
    features = featuresWith("shop", "orders"),
    readOnly = false,
    variant = "card",
  }: {
    features?: IFeatures;
    readOnly?: boolean;
    variant?: "card" | "detail";
  } = {}
) {
  return renderWithStore(
    <ProductAttachment tweet={value} variant={variant} />,
    {
      state: {
        session: sessionState({ viewer: testViewer, readOnly, features }),
      },
    }
  );
}

const group = () =>
  screen.getByRole("group", { name: "Product: Pistachio latte" });
const orderNow = () =>
  within(group()).getByRole("button", {
    name: "Order now",
  }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
});

describe("ProductAttachment", () => {
  it("shows nothing for a Tweet without a product (or while the shop is off)", () => {
    const { container } = renderCard(tweet(null));
    expect(container.innerHTML).toBe("");
  });

  it("shows an open business's product with Order now and View menu", async () => {
    const { store } = renderCard(tweet({ type: "product", product: card() }));
    const inCard = within(group());
    expect(
      inCard.getByRole("img", { name: "A tall glass of pistachio latte" })
    ).toBeTruthy();
    expect(group().textContent).toContain("5.00 credits");
    expect(group().textContent).toContain("Kızılay Kahve · Open · 9–12 min");
    expect(
      inCard.getByRole("link", { name: "Pistachio latte" }).getAttribute("href")
    ).toBe("/kizilaykahve/menu?product=seed-p-kk-latte");
    expect(
      inCard.getByRole("link", { name: "View menu" }).getAttribute("href")
    ).toBe("/kizilaykahve/menu");

    expect(orderNow().disabled).toBe(false);
    await userEvent.click(orderNow());
    expect(store.getState().ui).toMatchObject({
      dialog: "quickOrder",
      dialogArgs: { productId: "seed-p-kk-latte", tweetId: "seed-t22" },
    });
  });

  it("hides Order now until the orders feature is on", () => {
    renderCard(tweet({ type: "product", product: card() }), {
      features: featuresWith("shop"),
    });
    expect(
      within(group()).queryByRole("button", { name: "Order now" })
    ).toBeNull();
    expect(
      within(group()).getByRole("link", { name: "View menu" })
    ).toBeTruthy();
  });

  it("says when the business is closed, and disables Order now", () => {
    renderCard(
      tweet({ type: "product", product: card({}, { status: status.closed }) })
    );
    expect(group().textContent).toContain(
      "Kızılay Kahve · Closed · Opens 18:00 · 9–12 min"
    );
    expect(orderNow().disabled).toBe(true);
    expect(orderNow().getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(orderNow().getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Closed · Opens 18:00");
  });

  it("keeps clicks around a disabled Order now from opening the Tweet", async () => {
    const paused = tweet({
      type: "product",
      product: card({}, { status: status.paused }),
    });
    const { router } = renderWithStore(<TweetCard tweet={paused} />, {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features: featuresWith("shop", "orders"),
        }),
      },
    });
    // A disabled button has no pointer events: the click lands on its row.
    const row = orderNow().parentElement!;
    await userEvent.click(row);
    await userEvent.click(within(row).getByText("Not taking orders right now"));
    expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText(paused.text));
    expect(router.push).toHaveBeenCalledWith("/kizilaykahve/status/seed-t22");
  });

  it("says when the business has paused orders", () => {
    renderCard(
      tweet({ type: "product", product: card({}, { status: status.paused }) })
    );
    expect(group().textContent).toContain("Not taking orders right now");
    expect(orderNow().disabled).toBe(true);
  });

  it("marks a sold-out product", () => {
    renderCard(tweet({ type: "product", product: card({ available: false }) }));
    expect(within(group()).getAllByText("Sold out").length).toBeGreaterThan(0);
    expect(orderNow().disabled).toBe(true);
    expect(
      document.getElementById(orderNow().getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Sold out");
  });

  it("says a deleted product is no longer available", () => {
    renderCard(tweet({ type: "product", product: null }));
    expect(screen.getByText("This item is no longer available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Order now" })).toBeNull();
  });

  it("disables Order now on a read-only demo, saying why", () => {
    renderCard(tweet({ type: "product", product: card() }), { readOnly: true });
    expect(orderNow().disabled).toBe(true);
    expect(
      within(group()).getByText("Ordering is turned off on this read-only demo")
    ).toBeTruthy();
    expect(
      within(group()).getByRole("link", { name: "View menu" })
    ).toBeTruthy();
  });

  it("shows a bigger picture on the Tweet's own page", () => {
    renderCard(tweet({ type: "product", product: card() }), {
      variant: "detail",
    });
    expect(
      within(group())
        .getByRole("img", { name: "A tall glass of pistachio latte" })
        .getAttribute("width")
    ).toBe("96");
  });
});
