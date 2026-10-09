// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import { IBusinessSummary } from "../../types/Shop";
import BusinessCarousel from "./BusinessCarousel";
import FoodHub from "./FoodHub";
import { status, stubFetch } from "./testing";

const summary = (
  overrides: Partial<IBusinessSummary> & Pick<IBusinessSummary, "username">
): IBusinessSummary => ({
  fullname: overrides.username,
  image: null,
  banner: null,
  category: "cafe",
  placeId: "kizilay",
  deliveryFee: 150,
  status: status.open24,
  etaMinutes: [9, 12],
  highlights: [],
  ...overrides,
});

const places = [
  summary({
    username: "bowlandco",
    fullname: "Bowl & Co",
    category: "healthy",
  }),
  summary({
    username: "kizilaykahve",
    fullname: "Kızılay Kahve",
    highlights: ["Türk kahvesi", "Pistachio latte", "Cold brew"],
  }),
  summary({
    username: "lahmacunlab",
    fullname: "Lahmacun Lab",
    category: "restaurant",
    status: status.closed,
    deliveryFee: 0,
    etaMinutes: [14, 17],
  }),
];

const names = () =>
  within(screen.getByRole("list", { name: "Places" }))
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FoodHub", () => {
  it("shows every place, each card a link to its menu", () => {
    renderWithStore(<FoodHub items={places} />);
    expect(names()).toEqual(["Bowl & Co", "Kızılay Kahve", "Lahmacun Lab"]);

    const kahve = screen.getByRole("link", { name: /Kızılay Kahve/ });
    expect(kahve.getAttribute("href")).toBe("/kizilaykahve/menu");
    expect(kahve.textContent).toContain("Café");
    expect(kahve.textContent).toContain("Open 24 hours");
    expect(kahve.textContent).toContain("9–12 min · 1.50 credits fee");
    expect(kahve.textContent).toContain(
      "Türk kahvesi · Pistachio latte · Cold brew"
    );

    const lab = screen.getByRole("link", { name: /Lahmacun Lab/ });
    expect(lab.textContent).toContain("Closed · Opens 18:00");
    expect(lab.textContent).toContain("14–17 min · Free delivery");
  });

  it("filters by category with pressed chips, announcing the result", async () => {
    renderWithStore(<FoodHub items={places} />);
    const chips = screen.getByRole("group", { name: "Categories" });
    const chip = (name: string) => within(chips).getByRole("button", { name });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["All", "Café", "Restaurant", "Healthy", "Shop"]);
    expect(chip("All").getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(chip("Restaurant"));
    expect(chip("Restaurant").getAttribute("aria-pressed")).toBe("true");
    expect(chip("All").getAttribute("aria-pressed")).toBe("false");
    expect(names()).toEqual(["Lahmacun Lab"]);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "1 place in Restaurant"
    );

    await userEvent.click(chip("Shop"));
    expect(
      screen.getByText("No places in this category right now.")
    ).toBeTruthy();

    await userEvent.click(chip("All"));
    expect(names()).toHaveLength(3);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "3 places"
    );
  });

  it("says when there are no places at all", () => {
    renderWithStore(<FoodHub items={[]} />);
    expect(
      screen.getByRole("heading", {
        name: "No places are taking orders right now.",
      })
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Categories" })).toBeNull();
  });
});

describe("BusinessCarousel", () => {
  const renderCarousel = (features: IFeatures = featuresWith("shop")) =>
    renderWithStore(<BusinessCarousel />, {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features,
        }),
      },
    });

  it("lists places to order from as links", async () => {
    const api = stubFetch({
      "/api/businesses": () => [200, { items: places }],
    });
    vi.stubGlobal("fetch", vi.fn(api.fetch));
    renderCarousel();

    const row = screen.getByRole("region", { name: "Order from" });
    expect(row.getAttribute("aria-busy")).toBe("true");
    const lab = await within(row).findByRole("link", { name: /Lahmacun Lab/ });
    expect(lab.getAttribute("href")).toBe("/lahmacunlab/menu");
    expect(lab.textContent).toContain("Closed · Opens 18:00");
    expect(
      within(row).getByRole("link", { name: "See all" }).getAttribute("href")
    ).toBe("/food");
    expect(row.getAttribute("aria-busy")).toBe("false");
  });

  it("is hidden while the shop is off, and when loading fails", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    renderCarousel(featuresWith());
    expect(screen.queryByRole("region")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    cleanup();

    renderCarousel();
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Order from" })).toBeNull();
  });
});
