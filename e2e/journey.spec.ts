import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  test,
} from "@playwright/test";

import type { ILiveActivity } from "../types/Superapp";
import { features, topUp, unique, watchConsole } from "./helpers";

// One afternoon with the SuperApp, through the UI as a person would use it
// (§18 PR 13): tip Kızılay Kahve's latte Tweet, order the latte from it,
// message the café from the order, send it credits in that chat, book a
// ride, reply to the café's story, then find every payment in the wallet's
// activity (each row and its receipt lead to the right page) and the
// delivered order in Notifications. At SUPERAPP_TIME_SCALE=60 a Kızılay
// Kahve order is delivered about 25 s after it is placed. Other specs share
// the server, so money is checked as a delta and rows are found by the ids
// this run created.

const KAHVE = "Kızılay Kahve";
const CHAT = "dm-illlhanozkan-kizilaykahve";
const TIP = 200;
const ORDER = 650; // Pistachio latte 5.00 + delivery 1.50
const PAYMENT = 500;
const FARE = 630; // Kızılay → Atakule, economy

test.beforeEach(async ({ request }) => {
  const on = await features(request);
  test.skip(
    !(on.wallet && on.orders && on.messages && on.rides && on.stories),
    "The journey needs the wallet, orders, messages, rides and stories"
  );
});

async function available(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/wallet");
  expect(response.status()).toBe(200);
  return (await response.json()).wallet.available;
}

/** A rider has one ride at a time: wait out one left by another spec. */
async function noRideInProgress(request: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const { live } = (await (
          await request.get("/api/activity")
        ).json()) as {
          live: ILiveActivity[];
        };
        return live.filter((item) => item.kind === "ride").length;
      },
      { timeout: 60_000, intervals: [1_000] }
    )
    .toBe(0);
}

/** The transfer id a receipt link points at. */
async function receiptId(link: Locator): Promise<string> {
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/^\/wallet\/transactions\/[\w-]+$/);
  return decodeURIComponent(href.split("/").pop()!);
}

/** What a wallet activity row says, and where its receipt's "For" link goes. */
interface Entry {
  text: string;
  amount: string;
  forLink: string;
  path: string;
}

/**
 * On /wallet: the activity row of transfer `id` reads `text` and opens its
 * receipt, whose "For" link opens `path`.
 */
async function followActivity(
  page: Page,
  id: string,
  { text, amount, forLink, path }: Entry
) {
  await page.goto("/wallet");
  const row = page
    .getByRole("region", { name: "Activity" })
    .locator(`a[href="/wallet/transactions/${id}"]`);
  await expect(row).toContainText(text);
  await expect(row).toContainText(`sent ${amount} credits`);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/wallet/transactions/${id}$`));
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: forLink, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("tip, order, message, pay, ride and reply, then find it all in the wallet and Notifications", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const problems = watchConsole(page);
  await noRideInProgress(request);
  await topUp(request, TIP + ORDER + PAYMENT + FARE);
  const before = await available(request);

  // Tip the café's latte Tweet.
  await page.goto("/kizilaykahve/status/seed-t22");
  const tweet = page
    .getByRole("article")
    .filter({ hasText: "New on the menu: pistachio latte" })
    .first();
  await tweet.getByRole("button", { name: /^Tip( again)?\. / }).click();
  const tipSheet = page.getByRole("dialog", { name: "Tip @kizilaykahve" });
  await tipSheet.getByRole("button", { name: "Tip 2.00 credits" }).click();
  await tipSheet
    .getByRole("button", { name: `Tip 2.00 credits to ${KAHVE}` })
    .click();
  await expect(tipSheet).toBeHidden();
  const tipId = await receiptId(
    page
      .getByRole("status")
      .filter({ hasText: "You tipped @kizilaykahve 2.00 credits" })
      .getByRole("link", { name: "Receipt" })
  );

  // Order the latte right from the Tweet.
  await tweet
    .getByRole("group", { name: "Product: Pistachio latte" })
    .getByRole("button", { name: "Order now" })
    .click();
  const orderSheet = page.getByRole("dialog", { name: "Order now" });
  await orderSheet.getByRole("button", { name: "Pay 6.50 credits" }).click();
  await orderSheet
    .getByRole("button", { name: `Pay 6.50 credits to ${KAHVE}` })
    .click();
  const placed = orderSheet.getByRole("heading", {
    name: /^Order placed · #[2-9A-Z]{4}$/,
  });
  await expect(placed).toBeFocused();
  const code = (await placed.textContent())!.split("#")[1];
  await orderSheet.getByRole("link", { name: "Track order" }).click();
  await expect(page).toHaveURL(/\/orders\/order-[\w-]+$/);
  const orderPath = new URL(page.url()).pathname;
  const orderPaymentId = await receiptId(
    page.getByRole("link", { name: "Paid from wallet" })
  );

  // Message the café from the order, then send it credits in that chat.
  await page.getByRole("link", { name: `Message ${KAHVE}` }).click();
  await expect(page).toHaveURL(new RegExp(`/messages/${CHAT}$`));
  const chat = page.getByRole("log", { name: `Messages with ${KAHVE}` });
  const hello = unique("Is the latte on its way?");
  await page.getByRole("textbox", { name: `Message ${KAHVE}` }).fill(hello);
  await page.keyboard.press("Enter");
  await expect(chat.getByText(hello)).toBeVisible();
  await expect(chat.getByText("Sending…")).toHaveCount(0);

  const thanks = unique("Thanks for the quick coffee");
  await page.getByRole("button", { name: "Send credits" }).click();
  const paySheet = page.getByRole("dialog", { name: "Send credits" });
  await paySheet.getByRole("button", { name: "5.00" }).click();
  await paySheet.getByLabel("Note (optional)").fill(thanks);
  await paySheet.getByRole("button", { name: "Review" }).click();
  await paySheet
    .getByRole("button", { name: `Send 5.00 credits to ${KAHVE}` })
    .click();
  await expect(paySheet).toBeHidden();
  const card = chat.getByRole("listitem").filter({ hasText: thanks });
  await expect(card).toContainText("You sent 5.00 credits");
  const paymentId = await receiptId(
    card.getByRole("link", { name: "View receipt" })
  );

  // Book a ride.
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
  const ridePath = new URL(page.url()).pathname;
  const ridePaymentId = await receiptId(
    page.getByRole("link", { name: "Payment receipt" })
  );
  const { ride } = await (await request.get(`/api${ridePath}`)).json();

  try {
    // Reply to the café's story from the tray on Home, paused so the
    // viewer doesn't move on to (and mark seen) someone else's story.
    await page.goto("/");
    await page
      .getByRole("region", { name: "Stories" })
      .getByRole("button", { name: /^Kızılay Kahve's stories/ })
      .click();
    const viewer = page.getByRole("dialog", { name: "Stories" });
    await viewer.getByRole("button", { name: "Pause" }).click();
    const reply = unique("That latte looks great");
    await viewer.getByLabel(`Reply to ${KAHVE}`).fill(reply);
    await viewer.getByRole("button", { name: "Send" }).click();
    await viewer.getByRole("link", { name: "View in Messages" }).click();
    await expect(page).toHaveURL(new RegExp(`/messages/${CHAT}$`));
    await expect(chat.getByText(reply)).toBeVisible();

    // Every payment left the wallet, and nothing else did.
    expect(before - (await available(request))).toBe(
      TIP + ORDER + PAYMENT + FARE
    );

    // Each is in the wallet's activity, leading to its receipt and on to
    // what it paid for.
    const entries: [string, Entry][] = [
      [
        tipId,
        {
          text: "Tip on @kizilaykahve's Tweet",
          amount: "2.00",
          forLink: "Tweet",
          path: "/kizilaykahve/status/seed-t22",
        },
      ],
      [
        orderPaymentId,
        {
          text: `Order #${code} · ${KAHVE}`,
          amount: "6.50",
          forLink: `Order #${code}`,
          path: orderPath,
        },
      ],
      [
        paymentId,
        {
          text: `Payment to ${KAHVE}`,
          amount: "5.00",
          forLink: "Conversation",
          path: `/messages/${CHAT}`,
        },
      ],
      [
        ridePaymentId,
        {
          text: `Ride #${ride.code} · ${ride.driver.fullname}`,
          amount: "6.30",
          forLink: `Ride #${ride.code}`,
          path: ridePath,
        },
      ],
    ];
    for (const [id, entry] of entries) {
      await test.step(entry.text, () => followActivity(page, id, entry));
    }

    // Notifications say the order was delivered, and lead back to it.
    const delivered = page.getByRole("link", {
      name: `Your order #${code} from ${KAHVE} was delivered`,
    });
    await expect
      .poll(
        async () => {
          await page.goto("/notifications");
          return delivered.count();
        },
        { timeout: 60_000, intervals: [2_000] }
      )
      .toBe(1);
    await expect(delivered).toHaveAttribute("href", orderPath);
    await delivered.click();
    await expect(
      page.getByRole("heading", { level: 2, name: /^Delivered at \d\d:\d\d$/ })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  } finally {
    // One ride at a time: free the rider (and the driver) for other specs
    // when it can still be cancelled; after pickup it answers 409.
    await request.post(`/api${ridePath}/cancel`);
  }
});
