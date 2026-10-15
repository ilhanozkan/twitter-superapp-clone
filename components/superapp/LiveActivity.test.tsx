// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { initialActivityState } from "../../slices/activitySlice";
import { renderWithStore } from "../../test/render";
import { ILiveActivity } from "../../types/Superapp";
import LiveActivityBanner from "./LiveActivityBanner";
import LiveActivityCard from "./LiveActivityCard";

const order: ILiveActivity = {
  kind: "order",
  id: "o3",
  title: "Order from Kızılay Kahve",
  status: "On the way",
  eta: "2026-10-09T14:35:00.000Z",
  href: "/orders/o3",
  nextChangeAt: "2026-10-09T14:35:00.000Z",
};
const ride: ILiveActivity = {
  kind: "ride",
  id: "r1",
  title: "Ride to Atakule",
  status: "Ahmet is 3 min away",
  eta: null,
  href: "/rides/r1",
  nextChangeAt: null,
};

const withLive = (live: ILiveActivity[]) => ({
  activity: { ...initialActivityState, live },
});

afterEach(() => {
  cleanup();
});

describe("LiveActivityCard", () => {
  it("lists what is in progress, each row one link to its page", () => {
    renderWithStore(<LiveActivityCard />, { state: withLive([order, ride]) });
    const card = screen.getByRole("region", { name: "Happening now" });
    const links = within(card).getAllByRole("link");

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/orders/o3",
      "/rides/r1",
    ]);
    expect(links[0].textContent).toContain("Order from Kızılay Kahve");
    expect(links[0].textContent).toContain("On the way · arrives 14:35");
    expect(links[0].textContent).toContain("Track");
    expect(links[1].textContent).toContain("Ahmet is 3 min away");
    expect(links[1].textContent).not.toContain("arrives");
  });

  it("is hidden when nothing is in progress", () => {
    const { container } = renderWithStore(<LiveActivityCard />, {
      state: withLive([]),
    });
    expect(container.innerHTML).toBe("");
  });

  it("leaves out the item whose page is open", () => {
    renderWithStore(<LiveActivityCard />, {
      state: withLive([order, ride]),
      path: "/rides/r1?from=notification",
    });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/orders/o3");
  });
});

describe("LiveActivityBanner", () => {
  it("shows the first item under the page header", () => {
    renderWithStore(<LiveActivityBanner className="lg:hidden" />, {
      state: withLive([ride, order]),
    });
    const banner = screen.getByRole("region", { name: "Live activity" });
    expect(banner.className).toContain("lg:hidden");
    expect(within(banner).getByRole("link").getAttribute("href")).toBe(
      "/rides/r1"
    );
  });

  it("skips the item on its own page and hides when nothing is left", () => {
    renderWithStore(<LiveActivityBanner />, {
      state: withLive([ride]),
      path: "/rides/r1",
    });
    expect(screen.queryByRole("region", { name: "Live activity" })).toBeNull();
  });
});
