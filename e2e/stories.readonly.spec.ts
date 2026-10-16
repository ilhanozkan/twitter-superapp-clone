import { expect, test } from "@playwright/test";

import { watchConsole } from "./helpers";

// Stories on a READ_ONLY=true deployment: everything can be watched, nothing
// can be posted, and what you watched is kept in this tab (sessionStorage)
// because the server refuses to record it.

test("the tray has no + and the viewer works", async ({ page }) => {
  const problems = watchConsole(page);
  const reported: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") reported.push(request.url());
  });

  await page.goto("/");
  const tray = page.getByRole("region", { name: "Stories" });
  await expect(
    tray.getByRole("button", { name: "Your story", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to your story" })
  ).toHaveCount(0);

  await tray
    .getByRole("button", { name: "Mert Demir's stories, 2 new" })
    .click();
  const viewer = page.getByRole("dialog", { name: "Stories" });
  const position = viewer.locator("[aria-live='polite']");
  await expect(position).toHaveText(/^Story 1 of 2 by Mert Demir/);
  await expect(viewer.getByLabel(/^Reply to/)).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText(/^Story 2 of 2 by Mert Demir/);
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  const mert = tray.getByRole("button", {
    name: "Mert Demir's stories",
    exact: true,
  });
  await expect(mert).toBeFocused();
  // Kept in sessionStorage: still grey after a reload.
  await page.reload();
  await expect(mert.locator("[data-ring]")).toHaveAttribute(
    "data-ring",
    "seen"
  );

  expect(reported).toEqual([]);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("your own stories can be watched but not deleted", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("region", { name: "Stories" })
    .getByRole("button", { name: "Your story", exact: true })
    .click();
  const viewer = page.getByRole("dialog", { name: "Stories" });
  await expect(
    viewer.getByText("Building the SuperApp in public 🚀")
  ).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Seen by 3" })).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "Story options" })
  ).toHaveCount(0);
});

test("posting a story is refused", async ({ request }) => {
  const response = await request.post("/api/stories", {
    data: { content: { type: "text", text: "Nope", background: "blue" } },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("read_only");
});
