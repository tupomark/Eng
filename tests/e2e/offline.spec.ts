import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("opt-in public shell reopens a private local text and dictionary with the network disabled", async ({
  page,
  context,
}) => {
  await page.goto("/library/import");
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((items) => items.length),
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles(resolve("tests/fixtures/materials/original-reading.txt"));
  await page.getByLabel("Title / source name").fill("My private offline coast");
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await page.getByRole("region", { name: "Import preview" }).waitFor();
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Continue reading", exact: true }),
  ).toBeVisible();
  const documentId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("lexis.materials.v1")!).documents[0]
        .id as string,
  );
  await page.goto("/library/meanings");
  const ownForm = page
    .getByRole("main")
    .getByRole("form", { name: "Describe your own meaning", exact: true });
  await ownForm
    .getByRole("textbox", { name: "English word or expression", exact: true })
    .fill("harbour");
  await ownForm
    .getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    })
    .fill("A sheltered place where boats can stop.");
  await ownForm
    .getByRole("button", { name: "Create user-authored meaning", exact: true })
    .click();
  await expect(ownForm.getByRole("status")).toContainText(
    "Your meaning was created on this device.",
  );
  await page.goto("/offline");
  await page
    .getByRole("button", { name: "Enable offline workspace", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Offline workspace prepared" }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => {
    const values = await Promise.all(
      (await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      ),
    );
    return values.flat();
  });
  expect(cached).toContain("/offline");
  expect(
    cached.some((path) => /\/(api|account|reader|writing)(\/|$)/u.test(path)),
  ).toBe(false);
  await context.setOffline(true);
  await page.goto(`/reader/${documentId}`);
  await expect(
    page.getByRole("heading", {
      name: "My private offline coast",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Document text" }),
  ).toContainText("We linger by the sea.");
  await page.goto("/dictionary?q=linger");
  await expect(
    page.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Eight editorial entries and your own definitions are available locally/u,
    ),
  ).toBeVisible();
  await page
    .getByRole("searchbox", {
      name: "Word, form, phrase or translation",
      exact: true,
    })
    .fill("harbour");
  await expect(
    page.getByRole("heading", { name: "harbour", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("FULL ENTRY · YOUR DEFINITION · UNVERIFIED", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.materials.v1")!).documents[0]
          .title,
    ),
  ).toBe("My private offline coast");
});

test("confirmed profile removal drains the active offline worker and cannot recreate its cache", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Enable offline workspace", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Offline workspace prepared" }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const removal = page.getByRole("region", {
    name: "Remove local profile",
    exact: true,
  });
  await removal
    .getByRole("button", { name: "Refresh deletion preview" })
    .click();
  await removal.getByRole("checkbox").check();
  await removal
    .getByLabel("Type DELETE LOCAL PROFILE", { exact: true })
    .fill("DELETE LOCAL PROFILE");
  await removal
    .getByRole("button", {
      name: "Permanently delete local profile",
      exact: true,
    })
    .click();
  await expect(removal.getByRole("status")).toContainText(
    "inspected local stores have been removed",
    { timeout: 20000 },
  );
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((items) => items.length),
    ),
  ).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  // The still-open page cannot reinstall or refill a worker after deletion.
  await expect(
    page.getByRole("button", { name: "Enable offline workspace", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Offline settings" }).getByRole("alert"),
  ).toContainText("paused for local profile deletion");
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((items) => items.length),
    ),
  ).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("lexis.")),
    ),
  ).toEqual(["lexis.local-purge.v1"]);
});
