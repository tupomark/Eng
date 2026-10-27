import { expect, test } from "@playwright/test";

test("preferences persist independently and Grammar respects mixed explanation language", async ({
  page,
}) => {
  await page.goto("/settings");
  const language = page.getByRole("region", {
    name: "Language and learning preferences",
  });
  await language.getByTestId("explanation-language").selectOption("mixed");
  await page
    .getByRole("region", { name: "Appearance and access" })
    .getByLabel("Motion", { exact: true })
    .selectOption("reduce");
  await page.reload();
  await expect(language.getByTestId("explanation-language")).toHaveValue(
    "mixed",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-lexis-motion",
    "reduce",
  );
  await page.goto("/grammar");
  await expect(page.locator("p[lang=en]").first()).toBeVisible();
  await expect(page.locator("p[lang=ru]").first()).toBeVisible();
  await page.goto("/settings");
  await language.getByTestId("interface-language").selectOption("ru");
  await expect(
    page.getByRole("heading", { name: "Настройки", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(language.getByTestId("interface-language")).toHaveValue("ru");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.preferences.v1")!).taskLanguage,
    ),
  ).toBe("en");
});

test("damaged preferences stay available for raw export and never get overwritten", async ({
  page,
}) => {
  const raw = '{"version":1,"broken';
  await page.addInitScript(
    (value) => localStorage.setItem("lexis.preferences.v1", value),
    raw,
  );
  await page.goto("/settings");
  const language = page.getByRole("region", {
    name: "Language and learning preferences",
  });
  await expect(language.getByRole("alert")).toContainText("preserved");
  await expect(language.getByTestId("interface-language")).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export preferences / preserved original",
      exact: true,
    })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("lexis-preferences.json");
  const stream = await download.createReadStream();
  const bytes: Buffer[] = [];
  for await (const chunk of stream!) bytes.push(Buffer.from(chunk));
  expect(Buffer.concat(bytes).toString()).toBe(raw);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.preferences.v1")),
  ).toBe(raw);
});

test("confirmed local removal verifies stores and preserves unrelated origin data", async ({
  page,
}) => {
  const previousEpoch = "4fe4a403-3b0b-46c6-81a0-2c3e7399a8e9";
  await page.addInitScript((epoch) => {
    if (localStorage.getItem("lexis.profile-epoch.v1") === null)
      localStorage.setItem("lexis.profile-epoch.v1", epoch);
  }, previousEpoch);
  await page.goto("/settings");
  const enumerable = await page.evaluate(
    () => typeof indexedDB.databases === "function",
  );
  test.skip(
    !enumerable,
    "This browser cannot verify database enumeration; UI correctly leaves deletion partial.",
  );
  await page.evaluate(async () => {
    localStorage.setItem("lexis.private-test.v1", "private example");
    localStorage.setItem("unrelated-preference", "keep");
    sessionStorage.setItem("lexis.test-context", "private excerpt");
    sessionStorage.setItem("unrelated-session", "keep");
    await caches.open("lexis-private-test");
    await caches.open("unrelated-cache");
    for (const name of [
      "lexis.private-test.v1",
      "lexis.profile-backup.v1",
      "unrelated-database",
    ]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
  });
  const removal = page.getByRole("region", {
    name: "Remove local profile",
    exact: true,
  });
  await removal
    .getByRole("button", { name: "Refresh deletion preview" })
    .click();
  const remove = removal.getByRole("button", {
    name: "Permanently delete local profile",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await removal.getByRole("checkbox").check();
  await removal
    .getByLabel("Type DELETE LOCAL PROFILE", { exact: true })
    .fill("DELETE LOCAL PROFILE");
  await remove.click();
  await expect(removal.getByRole("status")).toContainText(
    "inspected local stores have been removed",
    { timeout: 15_000 },
  );
  const stores = await page.evaluate(async () => ({
    keys: Object.keys(localStorage).filter((key) => key.startsWith("lexis.")),
    temporary: Object.keys(sessionStorage).filter((key) =>
      key.startsWith("lexis."),
    ),
    caches: await caches.keys(),
    databases: (await indexedDB.databases()).map((item) => item.name),
    unrelated: localStorage.getItem("unrelated-preference"),
    unrelatedSession: sessionStorage.getItem("unrelated-session"),
    epoch: localStorage.getItem("lexis.profile-epoch.v1"),
  }));
  expect(stores.keys.sort()).toEqual([
    "lexis.local-purge.v1",
    "lexis.profile-epoch.v1",
  ]);
  expect(stores.epoch).toBe(previousEpoch);
  expect(stores.temporary).toEqual([]);
  expect(stores.caches).not.toContain("lexis-private-test");
  expect(stores.caches).toContain("unrelated-cache");
  expect(stores.databases).not.toContain("lexis.private-test.v1");
  expect(stores.databases).not.toContain("lexis.profile-backup.v1");
  expect(stores.databases).toContain("unrelated-database");
  expect(stores.unrelated).toBe("keep");
  expect(stores.unrelatedSession).toBe("keep");
  await removal
    .getByRole("button", { name: "Start a fresh local profile", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.local-purge.v1")),
  ).toBeNull();
  const freshEpoch = await page.evaluate(() =>
    localStorage.getItem("lexis.profile-epoch.v1"),
  );
  expect(freshEpoch).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu,
  );
  expect(freshEpoch).not.toBe(previousEpoch);
});
