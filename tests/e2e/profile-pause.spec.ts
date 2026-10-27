import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyState, saveSense } from "../../src/domain/learning";

async function readWriting(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open("lexis.writing.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("workspaces", "readonly");
          const read = transaction.objectStore("workspaces").get("local");
          let result: unknown;
          read.onsuccess = () => {
            result = read.result;
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

test("profile recovery refuses unsaved composing Writing in another tab before staging or applying data", async ({
  page,
  context,
}) => {
  const learning = saveSense(
    emptyState(),
    "profile-pause-original-sense",
    "An original generated recovery fixture.",
    "2026-10-20T00:00:00.000Z",
  );
  await page.goto("/settings/backup");
  await page.evaluate((value) => {
    localStorage.setItem("lexis.learning.v1", JSON.stringify(value));
  }, learning);
  await page.reload();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export selected profile", exact: true })
    .click();
  const backup = await readFile((await (await downloaded).path())!);
  await page.evaluate(() => localStorage.removeItem("lexis.learning.v1"));
  await page.reload();

  const writing = await context.newPage();
  try {
    await writing.goto("/writing");
    await writing
      .getByRole("button", { name: "Create your first draft", exact: true })
      .click();
    const dialog = writing.getByRole("dialog", {
      name: "A new piece of writing",
    });
    await dialog.getByLabel("Title", { exact: true }).fill("Keep my thought");
    await dialog
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const editor = writing.getByRole("textbox", {
      name: "Your English text",
      exact: true,
    });
    await expect(
      writing.getByRole("status").filter({ hasText: /^Saved on this device$/ }),
    ).toBeVisible();
    const storedWriting = await readWriting(writing);

    await page.bringToFront();
    await page.getByLabel("Backup file", { exact: true }).setInputFiles({
      name: "generated-profile.lexis",
      mimeType: "application/octet-stream",
      buffer: backup,
    });
    await page
      .getByRole("button", { name: "Preview selected sections", exact: true })
      .click();
    await expect(page.getByTestId("profile-preview")).toContainText(
      "Add / merge",
    );

    await writing.bringToFront();
    // A controlled composition keeps autosave pending. This tests the browser
    // lifecycle contract, not physical iPhone IME/selection behavior.
    await editor.dispatchEvent("compositionstart", { data: "" });
    const unsaved = "A thought still being composed. Незаконченная мысль 📝.";
    await editor.fill(unsaved);
    await expect(
      writing.getByRole("status").filter({ hasText: /^Unsaved changes$/ }),
    ).toBeVisible();

    await page.bringToFront();
    await page
      .getByRole("checkbox", {
        name: "I have saved my work and reviewed this merge.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Restore reviewed sections", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /could not pause ongoing work/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(async () => ({
        learning: localStorage.getItem("lexis.learning.v1"),
        marker: localStorage.getItem("lexis.profile-restore.v1"),
        epoch: localStorage.getItem("lexis.profile-epoch.v1"),
        journal: (await indexedDB.databases()).some(
          (database) => database.name === "lexis.profile-backup.v1",
        ),
      })),
    ).toEqual({ learning: null, marker: null, epoch: null, journal: false });
    await expect(editor).toHaveValue(unsaved);
    expect(await readWriting(writing)).toEqual(storedWriting);
    await expect(page.getByTestId("profile-preview")).toBeVisible();
  } finally {
    await writing.close();
  }
});
