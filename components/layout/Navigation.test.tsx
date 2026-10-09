// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { initialActivityState } from "../../slices/activitySlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import Explore from "../../pages/explore";
import { IFeatures } from "../../types/Superapp";
import MobileNav from "./MobileNav";
import Navigation, { navItems } from "./Navigation";
import PageHeader from "./PageHeader";

afterEach(() => {
  cleanup();
});

function stateWith({
  features = featuresWith("wallet"),
  managedBusinesses = [] as string[],
  newNotifications = 0,
  unreadConversations = 0,
  loaded = true,
  readOnly = false,
}: {
  features?: IFeatures;
  managedBusinesses?: string[];
  newNotifications?: number;
  unreadConversations?: number;
  loaded?: boolean;
  readOnly?: boolean;
} = {}) {
  return {
    session: sessionState({
      viewer: testViewer,
      readOnly,
      features,
      managedBusinesses,
    }),
    activity: {
      ...initialActivityState,
      newNotifications,
      unreadConversations,
      loaded,
    },
  };
}

const linkNames = () =>
  within(screen.getByRole("navigation", { name: "Primary" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("Navigation", () => {
  it("lists Wallet and Services in sidebar order", () => {
    renderWithStore(<Navigation />, { state: stateWith() });
    expect(linkNames()).toEqual([
      "Home",
      "Explore",
      "Notifications",
      "Messages",
      "Wallet",
      "Services",
      "Bookmarks",
      "Lists",
      "Profile",
    ]);
  });

  it("hides Wallet while the wallet is off; Services always shows", () => {
    renderWithStore(<Navigation />, {
      state: stateWith({ features: featuresWith() }),
    });
    expect(linkNames()).not.toContain("Wallet");
    expect(linkNames()).toContain("Services");
  });

  it("marks the current page, including a receipt under Wallet", () => {
    renderWithStore(<Navigation />, {
      state: stateWith(),
      path: "/wallet/transactions/seed-tx01",
    });
    expect(
      screen.getByRole("link", { name: "Wallet" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("puts badge counts in the links' accessible names", () => {
    renderWithStore(<Navigation />, {
      state: stateWith({
        features: featuresWith("wallet", "messages"),
        newNotifications: 3,
        unreadConversations: 1,
      }),
    });
    expect(
      screen.getByRole("link", { name: "Notifications, 3 new" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Messages, 1 unread conversation" })
    ).toBeTruthy();
  });

  it("caps badges at 99+ and spells plurals", () => {
    renderWithStore(<Navigation />, {
      state: stateWith({
        features: featuresWith("messages"),
        newNotifications: 120,
        unreadConversations: 2,
      }),
    });
    const bell = screen.getByRole("link", { name: "Notifications, 120 new" });
    expect(bell.textContent).toContain("99+");
    expect(
      screen.getByRole("link", { name: "Messages, 2 unread conversations" })
    ).toBeTruthy();
  });

  it("shows no Messages badge while Messages is off", () => {
    renderWithStore(<Navigation />, {
      state: stateWith({ unreadConversations: 4 }),
    });
    expect(screen.getByRole("link", { name: "Messages" })).toBeTruthy();
  });

  it("waits for the client's own count before badging the bell", () => {
    renderWithStore(<Navigation />, {
      state: stateWith({ newNotifications: 12, loaded: false }),
    });
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
  });

  it("shows Business only to managers while the shop is on", () => {
    const business = (features: IFeatures, managedBusinesses: string[]) =>
      navItems({
        username: "me",
        features,
        managedBusinesses,
        newNotifications: 0,
        unreadConversations: 0,
      }).some((item) => item.label === "Business");

    expect(business(featuresWith("shop"), ["superapp"])).toBe(true);
    expect(business(featuresWith("shop"), [])).toBe(false);
    expect(business(featuresWith(), ["superapp"])).toBe(false);

    renderWithStore(<Navigation />, {
      state: stateWith({
        features: featuresWith("shop"),
        managedBusinesses: ["superapp"],
      }),
    });
    expect(
      screen.getByRole("link", { name: "Business" }).getAttribute("href")
    ).toBe("/business");
  });
});

describe("MobileNav", () => {
  it("has the tabs Home, Explore, Services, Notifications and Messages", () => {
    renderWithStore(<MobileNav />, { state: stateWith() });
    expect(linkNames()).toEqual([
      "Home",
      "Explore",
      "Services",
      "Notifications",
      "Messages",
    ]);
    expect(
      screen.getByRole("button", { name: "Compose a Tweet" })
    ).toBeTruthy();
  });

  it("badges the tabs like the sidebar", () => {
    renderWithStore(<MobileNav />, {
      state: stateWith({
        features: featuresWith("messages"),
        newNotifications: 2,
        unreadConversations: 1,
      }),
    });
    expect(
      screen.getByRole("link", { name: "Notifications, 2 new" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Messages, 1 unread conversation" })
    ).toBeTruthy();
  });

  it("hides the compose button in read-only mode", () => {
    renderWithStore(<MobileNav />, { state: stateWith({ readOnly: true }) });
    expect(
      screen.queryByRole("button", { name: "Compose a Tweet" })
    ).toBeNull();
  });
});

describe("PageHeader account menu (phones)", () => {
  const open = async () => {
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /account menu/ }));
    return within(screen.getByRole("menu"))
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
  };

  it("holds Profile, Wallet, Bookmarks and Lists, then the More items", async () => {
    renderWithStore(<PageHeader title="Home" />, { state: stateWith() });
    expect(await open()).toEqual([
      "Profile",
      "Wallet",
      "Bookmarks",
      "Lists",
      "Display",
      "Keyboard shortcuts",
      "Source code",
    ]);
  });

  it("adds Business for managers while the shop is on, and drops Wallet while it is off", async () => {
    renderWithStore(<PageHeader title="Home" />, {
      state: stateWith({
        features: featuresWith("shop"),
        managedBusinesses: ["superapp"],
      }),
    });
    const items = await open();
    expect(items).toContain("Business");
    expect(items).not.toContain("Wallet");
  });
});

describe("Explore's header (phones)", () => {
  it("has the account menu and live activity, like every PageHeader", async () => {
    renderWithStore(<Explore query="" />, {
      path: "/explore",
      state: {
        ...stateWith(),
        activity: {
          ...initialActivityState,
          live: [
            {
              kind: "ride",
              id: "r1",
              title: "Ride to Atakule",
              status: "Ahmet is 3 min away",
              eta: null,
              href: "/rides/r1",
              nextChangeAt: null,
            },
          ],
        },
      },
    });

    const banner = screen.getByRole("region", { name: "Live activity" });
    expect(banner.className).toContain("lg:hidden");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /account menu/ }));
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(expect.arrayContaining(["Profile", "Wallet", "Bookmarks"]));
  });
});
