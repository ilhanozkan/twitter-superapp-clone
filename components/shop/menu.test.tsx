// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import BusinessSettings from "./BusinessSettings";
import BusinessSwitcher from "./BusinessSwitcher";
import MenuSection from "./MenuSection";
import ProductCard from "./ProductCard";
import ProductDialog from "./ProductDialog";
import { business, product } from "./testing";

const kahve = { username: "kizilaykahve", fullname: "Kızılay Kahve" };
const latte = product();
const simit = product({
  id: "seed-p-kk-simit",
  section: "Bakery",
  name: "Simit",
  price: 250,
  available: false,
});

const state = (features: IFeatures = featuresWith("shop", "orders")) => ({
  session: sessionState({ viewer: testViewer, readOnly: false, features }),
  cart: { business: null, lines: [], restored: true },
});

afterEach(() => {
  cleanup();
});

describe("MenuSection and ProductCard", () => {
  it("lists a section's products with a heading, prices and pictures", () => {
    const onOpen = vi.fn();
    renderWithStore(
      <MenuSection
        section={{ title: "Coffee", products: [latte, simit] }}
        renderProduct={(item) => (
          <ProductCard
            product={item}
            business={kahve}
            detailsHref={`/kizilaykahve/menu?product=${item.id}`}
            onOpenDetails={onOpen}
          />
        )}
      />,
      { state: state() }
    );

    const section = screen.getByRole("region", { name: "Coffee" });
    const items = within(section).getAllByRole("listitem");
    expect(
      items.map(
        (item) => within(item).getByRole("heading", { level: 3 }).textContent
      )
    ).toEqual(["Pistachio latte", "Simit"]);
    expect(items[0].textContent).toContain("5.00 credits");
    expect(
      within(items[0]).getByRole("img", {
        name: "A tall glass of pistachio latte",
      })
    ).toBeTruthy();
    expect(
      within(items[0]).getByRole("button", { name: "Add Pistachio latte" })
    ).toBeTruthy();

    // Sold out: a badge, and a disabled button that says why.
    expect(within(items[1]).getAllByText("Sold out")).toHaveLength(2);
    expect(
      (
        within(items[1]).getByRole("button", {
          name: "Sold out",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("links each product to its details", async () => {
    const onOpen = vi.fn();
    renderWithStore(
      <ProductCard
        product={latte}
        business={kahve}
        detailsHref="/kizilaykahve/menu?product=seed-p-kk-latte"
        onOpenDetails={onOpen}
      />,
      { state: state() }
    );
    const link = screen.getByRole("link", { name: "Pistachio latte" });
    expect(link.getAttribute("href")).toBe(
      "/kizilaykahve/menu?product=seed-p-kk-latte"
    );
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalled();
  });

  it("is a plain list until orders are on", () => {
    renderWithStore(
      <ProductCard product={latte} business={kahve} detailsHref="#" />,
      { state: state(featuresWith("shop")) }
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("5.00 credits")).toBeTruthy();
  });
});

describe("ProductDialog", () => {
  it("shows the product with its business, closed without one", async () => {
    const onClose = vi.fn();
    const { rerender } = renderWithStore(
      <ProductDialog product={latte} business={business()} onClose={onClose} />,
      { state: state() }
    );
    const dialog = screen.getByRole("dialog", { name: "Pistachio latte" });
    expect(dialog.textContent).toContain(
      "Espresso, steamed milk and Antep pistachio cream."
    );
    expect(dialog.textContent).toContain("5.00 credits");
    expect(dialog.textContent).toContain("Open 24 hours");
    expect(dialog.textContent).toContain(
      "Delivery 9–12 min · 1.50 credits fee · Min. 3.00"
    );
    expect(
      within(dialog).getByRole("button", { name: "Add Pistachio latte" })
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" })
    );
    expect(onClose).toHaveBeenCalled();

    rerender(
      <ProductDialog product={null} business={business()} onClose={onClose} />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("BusinessSwitcher", () => {
  const businesses = [
    { username: "superapp", fullname: "Twitter SuperApp", image: null },
    { username: "kizilaykahve", fullname: "Kızılay Kahve", image: null },
  ];

  it("links to each business the viewer runs, keeping the tab", () => {
    renderWithStore(
      <BusinessSwitcher
        businesses={businesses}
        current="kizilaykahve"
        tab="settings"
      />
    );
    const nav = screen.getByRole("navigation", { name: "Your businesses" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/business?tab=settings",
      "/business?business=kizilaykahve&tab=settings",
    ]);
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(links[0].getAttribute("aria-current")).toBeNull();
  });

  it("is hidden for a single business", () => {
    renderWithStore(
      <BusinessSwitcher
        businesses={businesses.slice(0, 1)}
        current="superapp"
        tab="menu"
      />
    );
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("BusinessSettings", () => {
  it("summarizes the profile and where to edit it", () => {
    renderWithStore(
      <BusinessSettings
        business={business({
          managers: ["illlhanozkan"],
          greeting: "Merhaba! This is an automatic greeting.",
        })}
      />
    );
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    const values = screen
      .getAllByRole("definition")
      .map((value) => value.textContent);
    const row = (term: string) => values[terms.indexOf(term)];
    expect(row("Category")).toBe("Café");
    expect(row("Address")).toBe("Kızılay Square, Çankaya, Ankara (Kızılay)");
    expect(row("Hours")).toBe("Open 24 hours (Europe/Istanbul)");
    expect(row("Delivery estimate")).toBe(
      "9–12 min (3 min to prepare, 6 min to deliver)"
    );
    expect(row("Delivery fee")).toBe("1.50 credits");
    expect(row("Minimum order")).toBe("3.00 credits");
    expect(row("Managers")).toBe("@kizilaykahve, @illlhanozkan");
    expect(screen.getByText(/Edit in Studio/)).toBeTruthy();
  });
});
