import { expect, test, type Locator, type Page } from "@playwright/test";
import { resolve } from "node:path";

test.use({ viewport: { width: 390, height: 664 }, reducedMotion: "reduce" });
async function aboveNavigation(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  const nav = await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .boundingBox();
  expect(bounds).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav!.y - 8);
}

test("Home exposes its primary reading action above the bottom navigation on a short phone viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Opening your local learning space" }),
  ).toHaveCount(0);
  await aboveNavigation(
    page,
    page.getByRole("link", { name: "Start reading", exact: true }),
  );
});

test("own Reader presents real book text in the first viewport at the default readable size", async ({
  page,
}) => {
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles(resolve("tests/fixtures/materials/original-reading.txt"));
  await page.getByLabel("Title / source name").fill("A quiet coast");
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Continue reading", exact: true })
    .click();
  const paragraph = page
    .getByRole("article", { name: "Document text" })
    .locator("p")
    .first();
  await expect(paragraph).toContainText("We linger by the sea.");
  const bounds = await paragraph.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(664);
  expect(
    await paragraph.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).fontSize),
    ),
  ).toBeGreaterThanOrEqual(18);
});

test("Full Dictionary exposes the requested headword before scrolling on a short phone viewport", async ({
  page,
}) => {
  await page.goto("/dictionary?q=linger");
  await aboveNavigation(
    page,
    page.getByRole("heading", { name: "linger", exact: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Dictionary", exact: true }),
  ).toBeVisible();
});
