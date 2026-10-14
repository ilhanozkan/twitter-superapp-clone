import { APIRequestContext, expect, Page, test } from "@playwright/test";

import type { IRide, RideQuoteResponse } from "../types/Ride";
import type { ILiveActivity } from "../types/Superapp";
import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  features,
  idempotencyKey,
  setTheme,
  topUp,
  watchConsole,
  WIDTHS,
} from "./helpers";

// Rides at SUPERAPP_TIME_SCALE=60 (playwright.config.ts): a driver is
// matched after 3 s, pickup is 30 s after booking (the free cancel window
// never gets shorter) and Kızılay → Atakule (8 min) takes 8 s more. Tests
// book their own rides and assert balance deltas, never balances. The
// driver is picked by a hash of the booking's key, so a test tips whoever
// drove (Ahmet or Elif, the two economy drivers).

const FARE = 630; // Kızılay → Atakule, economy

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).rides, "Rides is off on this server");
});

async function available(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/wallet");
  expect(response.status()).toBe(200);
  return (await response.json()).wallet.available;
}

/**
 * A rider has one ride at a time: wait out one still in progress (from
 * another spec, or an earlier run on a reused server).
 */
async function noRideInProgress(request: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const response = await request.get("/api/activity");
        const { live } = (await response.json()) as { live: ILiveActivity[] };
        return live.filter((item) => item.kind === "ride").length;
      },
      { timeout: 60_000, intervals: [1_000] }
    )
    .toBe(0);
}

/** Books Kızılay → Atakule (economy) through the API. */
async function bookByApi(request: APIRequestContext): Promise<IRide> {
  const quote: RideQuoteResponse = await (
    await request.get("/api/rides/quote?from=kizilay&to=atakule")
  ).json();
  const economy = quote.quotes.find((item) => item.type === "economy")!;
  const response = await request.post("/api/rides", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: {
      from: "kizilay",
      to: "atakule",
      type: "economy",
      expectedFare: economy.fare,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).ride;
}

/** Books Kızılay → Atakule (economy) on /rides and waits for the ride's page. */
async function bookOnPage(page: Page) {
  await page.goto("/rides");
  await page.getByLabel("Pickup", { exact: true }).selectOption("kizilay");
  await page.getByLabel("Destination", { exact: true }).selectOption("atakule");
  await page
    .getByRole("radio", { name: /^Economy · 6\.30 credits · / })
    .check();
  await page
    .getByRole("button", { name: "Book Economy · 6.30 credits" })
    .click();
  await expect(page).toHaveURL(/\/rides\/ride-[\w-]+$/);
}

const statusHeading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 2, name });

test.describe("booking", () => {
  test("Recent rides lists the demo user's seeded trip", async ({ page }) => {
    await page.goto("/rides");
    const recent = page.getByRole("region", { name: "Recent rides" });
    const seeded = recent.getByRole("link", {
      name: /^Bahçelievler to Atakule/,
    });
    // On a reused server, rides booked by earlier runs come first.
    const more = recent.getByRole("button", { name: "Show more" });
    const rows = recent.getByRole("link");
    while ((await seeded.count()) === 0 && (await more.isVisible())) {
      const shown = await rows.count();
      await more.click();
      await expect.poll(() => rows.count()).toBeGreaterThan(shown);
    }
    await expect(seeded).toHaveAttribute("href", "/rides/seed-ride01");
  });

  test("book Kızılay → Atakule, ride to the end and tip the driver", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await noRideInProgress(request);
    await topUp(request, 2_000);
    const before = await available(request);
    const problems = watchConsole(page);

    await bookOnPage(page);
    await expect(
      statusHeading(page, /^(Finding your driver…|\S+ is \d+ min away)$/)
    ).toBeVisible();
    // Paid upfront: the fare left the wallet at booking.
    expect(before - (await available(request))).toBe(FARE);

    const driver = page.getByRole("region", { name: "Your driver" });
    await expect(driver).toBeVisible({ timeout: 10_000 });
    const driverName = (await driver.getByRole("link").first().textContent())!;
    const firstName = driverName.split(" ")[0];
    expect(["Ahmet", "Elif"]).toContain(firstName);
    await expect(
      page.getByRole("button", { name: "Cancel ride" })
    ).toBeVisible();

    await expect(
      statusHeading(page, /^On the way to Atakule · arrives \d\d:\d\d$/)
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("button", { name: "Cancel ride" })).toHaveCount(
      0
    );
    await expect(statusHeading(page, "You’ve arrived")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Receipt" })).toBeVisible();

    await page
      .getByRole("button", { name: `Tip ${firstName} 2.00 credits` })
      .click();
    const dialog = page.getByRole("dialog", { name: `Tip ${firstName}` });
    await dialog
      .getByRole("button", { name: `Tip 2.00 credits to ${driverName}` })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(`Thanks! You tipped ${firstName} 2.00 credits.`)
    ).toBeVisible();
    expect(before - (await available(request))).toBe(FARE + 200);

    // The completed ride is in the notifications, leading back to it.
    const rideUrl = new URL(page.url()).pathname;
    await page.goto("/notifications");
    await expect(
      page
        .getByRole("link", { name: "Your ride to Atakule is complete" })
        .first()
    ).toHaveAttribute("href", rideUrl);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("book and cancel before pickup for a full refund", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    await noRideInProgress(request);
    await topUp(request, 2_000);
    const before = await available(request);

    await bookOnPage(page);
    await page.getByRole("button", { name: "Cancel ride" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this ride?" });
    await dialog
      .getByRole("button", { name: "Cancel ride and refund 6.30 credits" })
      .click();

    await expect(
      statusHeading(page, "Ride cancelled · refunded")
    ).toBeVisible();
    await expect(
      statusHeading(page, "Ride cancelled · refunded")
    ).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Refund receipt" })
    ).toBeVisible();
    expect(await available(request)).toBe(before);
  });

  test("“Ride here” on a business profile preselects the destination", async ({
    page,
  }) => {
    await page.goto("/kizilaykahve");
    await page.getByRole("link", { name: "Ride here" }).click();
    await expect(page).toHaveURL(/\/rides\?to=kizilay$/);
    await expect(page.getByLabel("Destination", { exact: true })).toHaveValue(
      "kizilay"
    );
    await expect(page.getByLabel("Pickup", { exact: true })).not.toHaveValue(
      "kizilay"
    );
    await expect(
      page.getByRole("img", { name: /^Map from .+ to Kızılay, \d+\.\d km$/ })
    ).toBeVisible();
  });

  test("the driver card offers Message only while Messages is on", async ({
    page,
    request,
  }) => {
    const { messages } = await features(request);
    await page.goto("/rides/seed-ride01");
    const message = page.getByRole("link", { name: "Message Ahmet" });
    if (messages) {
      await expect(message).toHaveAttribute(
        "href",
        "/messages?to=ahmet_drives"
      );
    } else {
      await expect(message).toHaveCount(0);
    }
    await expect(page.getByText("White Toyota Corolla")).toBeVisible();
    await expect(page.getByText(/\bratings?\b|★/i)).toHaveCount(0);
  });
});

test.describe("accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`/rides has no serious violations in ${theme} mode`, async ({
      page,
    }) => {
      await setTheme(page, theme);
      await page.goto("/rides");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page);
    });

    test(`a ride in progress has no serious violations in ${theme} mode`, async ({
      page,
      request,
    }) => {
      test.setTimeout(90_000);
      await noRideInProgress(request);
      await topUp(request, 2_000);
      const ride = await bookByApi(request);
      try {
        await setTheme(page, theme);
        await page.goto(`/rides/${ride.id}`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          page.getByRole("button", { name: "Cancel ride" })
        ).toBeVisible();
        await expectNoSeriousViolations(page);
        await page.setViewportSize({ width: 360, height: 800 });
        await expectNoHorizontalScroll(page, "a ride in progress at 360px");
      } finally {
        // Free the rider (and the driver) for the next test.
        await request.post(`/api/rides/${ride.id}/cancel`);
      }
    });

    test(`a completed ride has no serious violations in ${theme} mode`, async ({
      page,
    }) => {
      await setTheme(page, theme);
      await page.goto("/rides/seed-ride01");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(statusHeading(page, "You’ve arrived")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page);

      // The tip review, too.
      await page
        .getByRole("button", { name: "Tip Ahmet 1.00 credits" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Tip Ahmet" })
      ).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }
});

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/rides",
        "/rides?from=bahcelievler&to=esenboga",
        "/rides/seed-ride01",
      ]) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
      }
    });
  }
});
