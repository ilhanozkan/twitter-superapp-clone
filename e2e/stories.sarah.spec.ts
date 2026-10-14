import { expect, test } from "@playwright/test";

import { unique } from "./helpers";

// Stories as Sarah (sarahcodes), on her own server: nothing else there
// watches Mert Demir's two stories, so this can watch them out of order,
// or depends on Sarah's one story, so this can delete it.

test("watching a later story first leaves only the earlier one new", async ({
  page,
  request,
}) => {
  const tray = page.getByRole("region", { name: "Stories" });
  await page.goto("/");
  await expect(
    tray.getByRole("button", { name: "Mert Demir's stories, 2 new" })
  ).toBeVisible();

  // A link to Mert's second story plays it without the first.
  await page.goto("/stories/foodie_ankara?story=seed-story04");
  const viewer = page.getByRole("dialog", { name: "Stories" });
  await expect(viewer.locator("[aria-live='polite']")).toHaveText(
    /^Story 2 of 2 by Mert Demir/
  );
  await viewer.getByRole("button", { name: "Pause" }).click();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect
    .poll(async () => {
      const body = await (
        await request.get("/api/stories?author=foodie_ankara")
      ).json();
      return body.items.map(
        (story: { viewer: { seen: boolean } }) => story.viewer.seen
      );
    })
    .toEqual([false, true]);

  await page.goto("/");
  const mert = tray.getByRole("button", {
    name: "Mert Demir's stories, 1 new",
  });
  await expect(mert).toBeVisible();
  await expect(mert.locator("[data-ring]")).toHaveAttribute(
    "data-ring",
    "unseen"
  );

  // It opens on the one still new.
  await mert.click();
  await expect(viewer.locator("[aria-live='polite']")).toHaveText(
    /^Story 1 of 2 by Mert Demir/
  );
});

test("focus stays on your item when your only story goes and your first comes", async ({
  page,
}) => {
  const tray = page.getByRole("region", { name: "Stories" });
  const viewer = page.getByRole("dialog", { name: "Stories" });
  const yours = tray.getByRole("button", { name: "Your story", exact: true });
  const add = tray.getByRole("button", { name: "Add to your story" });
  await page.goto("/");

  await yours.focus();
  await page.keyboard.press("Enter");
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Pause" }).click();
  await viewer.getByRole("button", { name: "Story options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await viewer
    .getByRole("region", { name: "Delete this story?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(viewer).toBeHidden();
  // The tray reloads with nothing of Sarah's: one "Add to your story".
  await expect(yours).toHaveCount(0);
  await expect(add).toHaveCount(1);
  await expect(add).toBeFocused();

  await page.keyboard.press("Enter");
  const composer = page.getByRole("dialog", { name: "Add to your story" });
  await composer.getByLabel("Story text").fill(unique("Sarah's first story"));
  await composer.getByRole("button", { name: "Share to your story" }).click();
  await expect(composer).toBeHidden();
  await expect(add).toHaveCount(1);
  await expect(yours).toBeVisible();
  await expect(yours).toBeFocused();
});
