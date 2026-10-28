import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function createDraft(page: Page, title = "A private note") {
  await page.goto("/writing");
  await expect(page.getByRole("main")).toBeVisible();
  await page
    .getByRole("button", { name: "Create your first draft", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "A new piece of writing" });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  return page.getByRole("textbox", { name: "Your English text", exact: true });
}

async function readWriting(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        version: number;
        owner: string;
        drafts: {
          id: string;
          tips: string[];
          headId: string;
          revisions: { id: string; text: string; origin: string }[];
        }[];
      }>((resolve, reject) => {
        const request = indexedDB.open("lexis.writing.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("workspaces", "readonly")
            .objectStore("workspaces")
            .get("local");
          read.onsuccess = () => {
            resolve(read.result);
            database.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

test("Writing saves original revisions, returns from Grammar to the same selection, and challenges grammar without inventing writing evidence", async ({
  page,
}) => {
  const editor = await createDraft(page);
  const beforeLearning = await page.evaluate(() =>
    localStorage.getItem("lexis.learning.v1"),
  );
  const original =
    "Private note. Each window has a story. Мой собственный текст. 📝";
  await editor.fill(original);
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved on this device$/ }),
  ).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue(original);
  await editor.fill(original + " I want to make the idea clearer.");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved on this device$/ }),
  ).toBeVisible();
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(14, 37);
  });
  await page
    .getByRole("button", { name: "Open Grammar Atlas", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Context from your writing" }),
  ).toContainText(original.slice(14, 37));
  expect(page.url()).not.toContain("Private");
  const practice = page.getByRole("region", {
    name: "Grammar practice",
    exact: true,
  });
  await practice
    .getByRole("button", { name: "Try without the rule", exact: true })
    .click();
  await practice.getByRole("radio", { name: "has", exact: true }).check();
  await page.reload();
  await expect(
    practice.getByRole("radio", { name: "has", exact: true }),
  ).toBeChecked();
  await practice
    .getByRole("button", { name: "Check my choice", exact: true })
    .click();
  await expect(practice).toContainText("Accepted for this exercise.");
  await practice.getByRole("button", { name: "Good", exact: true }).click();
  await expect(practice).toContainText("Next FSRS review:");
  await practice
    .getByRole("button", { name: "Challenge this result", exact: true })
    .click();
  const challenge = page.getByRole("dialog", {
    name: "Challenge this grammar result",
  });
  await challenge
    .getByRole("textbox", { name: "What should be reconsidered?", exact: true })
    .fill("Please exclude this practice while I review the wording.");
  await challenge
    .getByRole("button", { name: "Exclude this observation", exact: true })
    .click();
  await expect(practice).toContainText("Excluded from active estimates");
  await expect(
    page.getByRole("region", { name: "Grammar evidence", exact: true }),
  ).toContainText("Not enough data yet");
  const tasks = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1") ?? "{}"),
  );
  expect(tasks.attempts).toHaveLength(1);
  expect(tasks.tasks[0]).toMatchObject({
    target: { kind: "grammar", conceptId: "subject-verb-agreement" },
    skill: "grammar",
  });
  expect(tasks.challenges).toHaveLength(1);
  expect(tasks.scheduleExclusions).toHaveLength(1);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBe(beforeLearning);
  await page
    .getByRole("link", { name: "Return to your draft", exact: true })
    .click();
  await expect(editor).toHaveValue(
    original + " I want to make the idea clearer.",
  );
  expect(
    await editor.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([14, 37]);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export writing", exact: true })
    .click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(
    exported.drafts[0].revisions.some(
      (revision: { text: string }) => revision.text === original,
    ),
  ).toBe(true);
  expect(exported.drafts[0].revisions.at(-1).text).toBe(
    original + " I want to make the idea clearer.",
  );
  // A generated empty test profile proves that this export can actually be restored.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("lexis.writing.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("workspaces", "readwrite");
          transaction
            .objectStore("workspaces")
            .put({ version: 1, owner: "local", drafts: [] }, "local");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
      }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create your first draft", exact: true }),
  ).toBeVisible();
  const file = {
    name: "writing-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  };
  await page
    .getByLabel("Choose writing backup", { exact: true })
    .setInputFiles(file);
  const restore = page.getByRole("dialog", {
    name: "Preview writing restore",
    exact: true,
  });
  await expect(restore).toContainText("1 new draft");
  await restore
    .getByRole("button", { name: "Confirm writing restore", exact: true })
    .click();
  await expect(restore).not.toBeVisible();
  await expect(editor).toHaveValue(
    original + " I want to make the idea clearer.",
  );
  const restored = await readWriting(page);
  expect(restored.drafts[0].revisions).toEqual(exported.drafts[0].revisions);
  await page
    .getByLabel("Choose writing backup", { exact: true })
    .setInputFiles(file);
  await expect(restore).toContainText("0 new drafts, 0 new revisions");
  await restore
    .getByRole("button", { name: "Confirm writing restore", exact: true })
    .click();
  await expect(restore).not.toBeVisible();
  expect((await readWriting(page)).drafts[0].revisions).toEqual(
    restored.drafts[0].revisions,
  );
});

test("two writing tabs preserve both competing versions and require explicit resolution", async ({
  page,
  context,
}) => {
  const editor = await createDraft(page, "Two perspectives");
  await editor.fill("A shared beginning.");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved on this device$/ }),
  ).toBeVisible();
  const id = (await readWriting(page)).drafts[0].id;
  const other = await context.newPage();
  await other.goto(`/writing?draft=${encodeURIComponent(id)}`);
  const otherEditor = other.getByRole("textbox", {
    name: "Your English text",
    exact: true,
  });
  await expect(otherEditor).toHaveValue("A shared beginning.");
  await Promise.all([
    editor.fill("The first tab's independent version."),
    otherEditor.fill("The second tab's independent version."),
  ]);
  const conflict = page.getByRole("region", {
    name: "Writing versions conflict",
    exact: true,
  });
  await expect(conflict).toBeVisible();
  await expect(
    other.getByRole("region", {
      name: "Writing versions conflict",
      exact: true,
    }),
  ).toBeVisible();
  const stored = (await readWriting(page)).drafts[0];
  expect(stored.tips).toHaveLength(2);
  expect(stored.revisions.map((revision) => revision.text)).toEqual(
    expect.arrayContaining([
      "A shared beginning.",
      "The first tab's independent version.",
      "The second tab's independent version.",
    ]),
  );
  await conflict.locator("summary").first().click();
  await conflict
    .getByRole("button", { name: "Continue from this version", exact: true })
    .first()
    .click();
  await expect(conflict).not.toBeVisible();
  await page.reload();
  const resolved = (await readWriting(page)).drafts[0];
  expect(resolved.tips).toHaveLength(1);
  expect(resolved.revisions.map((revision) => revision.text)).toEqual(
    expect.arrayContaining([
      "The first tab's independent version.",
      "The second tab's independent version.",
    ]),
  );
  expect(resolved.revisions.at(-1)?.origin).toBe("merged");
  await other.close();
});

test("an unsupported writing schema is preserved and exportable instead of being reset", async ({
  page,
}) => {
  await page.goto("/writing");
  await expect(
    page.getByRole("button", { name: "Create your first draft", exact: true }),
  ).toBeVisible();
  const damaged = {
    version: 99,
    owner: "local",
    drafts: [{ privateOriginal: "Keep this original material intact." }],
  };
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("lexis.writing.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("workspaces", "readwrite");
          transaction.objectStore("workspaces").put(value, "local");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    damaged,
  );
  await page.reload();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "writing workspace could not be opened safely" }),
  ).toContainText("could not be opened safely");
  await expect(
    page.getByRole("button", { name: "Create your first draft", exact: true }),
  ).toHaveCount(0);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export stored writing", exact: true })
    .click();
  const download = await downloadEvent;
  expect(JSON.parse(await readFile((await download.path())!, "utf8"))).toEqual(
    damaged,
  );
  expect(await readWriting(page)).toEqual(damaged);
});
