// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toRide } from "../../lib/superapp/rides";
import { renderWithStore } from "../../test/render";
import { IRide, RidePageResponse } from "../../types/Ride";
import RideList from "./RideList";
import { cancelledFields, REQUESTED_AT, storedRide } from "./testFixtures";

const now = new Date(Date.parse(REQUESTED_AT) + 3_600_000);
const ride = (id: string, fields = {}): IRide =>
  toRide(storedRide({ id, paymentTransferId: `${id}-1`, ...fields }), now);

const page = (
  items: IRide[],
  nextCursor: string | null = null
): RidePageResponse => ({
  items,
  nextCursor,
  serverNow: now.toISOString(),
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RideList", () => {
  it("links each ride, read as a sentence with its status", () => {
    renderWithStore(
      <RideList
        title="Recent rides"
        initial={page([
          ride("ride-a"),
          ride("ride-b", { from: "bahcelievler", ...cancelledFields(20) }),
        ])}
        role="rider"
        empty="No rides yet."
      />
    );

    expect(screen.getByRole("region", { name: "Recent rides" })).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/rides/ride-a",
      "/rides/ride-b",
    ]);
    // The arrow is drawn; "to" is what is read.
    expect(
      screen.getByRole("link", { name: /^Kızılay to Atakule/ }).textContent
    ).toMatch(/Completed · Oct 9.*6\.30 credits$/);
    expect(
      screen.getByRole("link", { name: /^Bahçelievler to Atakule/ }).textContent
    ).toContain("Cancelled · refunded");
  });

  it("names the rider in a driver's trips", () => {
    renderWithStore(
      <RideList
        title="Your trips"
        initial={page([ride("ride-a")])}
        role="driver"
        empty="No trips yet."
      />
    );
    expect(screen.getByRole("link").textContent).toContain(
      "Ilhan Ozkan · Completed"
    );
  });

  it("says when there are none", () => {
    renderWithStore(
      <RideList
        title="Recent rides"
        initial={page([])}
        role="rider"
        empty="No rides yet. Your trips will show up here."
      />
    );
    expect(
      screen.getByText("No rides yet. Your trips will show up here.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("loads the next page as the same role and focuses its first ride", async () => {
    const paths: string[] = [];
    const answers = [
      () =>
        Response.json(
          { error: { code: "unavailable_service", message: "Try again." } },
          { status: 503 }
        ),
      () => Response.json(page([ride("ride-c")])),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        paths.push(path);
        return answers.shift()!();
      })
    );
    renderWithStore(
      <RideList
        title="Your trips"
        initial={page([ride("ride-a"), ride("ride-b")], "cursor-1")}
        role="driver"
        empty="No trips yet."
      />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Try again.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getAllByRole("link")).toHaveLength(3));
    expect(paths).toEqual([
      "/api/rides?as=driver&cursor=cursor-1",
      "/api/rides?as=driver&cursor=cursor-1",
    ]);
    expect(document.activeElement?.getAttribute("href")).toBe("/rides/ride-c");
    expect(
      screen.queryByRole("button", { name: /Show more|Retry/ })
    ).toBeNull();
  });
});
