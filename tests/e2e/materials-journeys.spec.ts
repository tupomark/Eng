import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const fixture = (name: string) => resolve("tests/fixtures/materials", name);

test("own TXT survives preview, bookmark, Dictionary return and reload", async ({
  page,
}) => {
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles(fixture("original-reading.txt"));
  await page.getByLabel("Title / source name").fill("My coast reading");
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("My coast reading");
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Continue reading", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My coast reading", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Document text" }),
  ).toContainText("We linger by the sea.");
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Bookmark saved");
  await page.locator("#paragraph-1").evaluate((paragraph) => {
    const text = paragraph.firstChild!;
    const offset = text.textContent!.indexOf("linger");
    const range = document.createRange();
    range.setStart(text, offset);
    range.setEnd(text, offset + "linger".length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page
    .getByRole("button", { name: "Look up selection: linger", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dictionary\?/u);
  await expect(
    page.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "My coast reading", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("article", { name: "Document text" }),
  ).toContainText("A trace of rain remains.");
  const documents = await page.evaluate(
    () => JSON.parse(localStorage.getItem("lexis.materials.v1")!).documents,
  );
  expect(documents).toHaveLength(1);
  expect(documents[0].bookmarks).toHaveLength(1);
  expect(documents[0].position.paragraphIndex).toBeGreaterThanOrEqual(0);
});

test("DRM-free EPUB chapters and structural place reopen", async ({ page }) => {
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles(fixture("original-book.epub"));
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("A quiet coast");
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Continue reading", exact: true })
    .click();
  await page.getByText("Contents, search & bookmarks", { exact: true }).click();
  await page.getByLabel("Chapter", { exact: true }).selectOption({ index: 1 });
  await expect(
    page.getByRole("article", { name: "Document text" }),
  ).toContainText("A trace of rain remains.");
  await page.reload();
  await expect(
    page.getByRole("article", { name: "Document text" }),
  ).toContainText("A trace of rain remains.");
  await page.getByRole("button", { name: "Reading options" }).click();
  // Appearance is a separate persisted key and must not replace document identity.
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const chapters = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("lexis.materials.v1")!).documents[0]
        .chapters,
  );
  expect(chapters).toHaveLength(2);
});

test("1,001 vocabulary rows preview in Inbox without creating learning debt", async ({
  page,
}) => {
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Vocabulary list", exact: true })
    .click();
  const text =
    "Word,Translation,Context,Source,POS\n" +
    Array.from({ length: 1001 }, (_, index) =>
      index === 0
        ? "linger,задерживаться,We linger by the sea.,My notes,verb"
        : `word-${index},перевод-${index},Context ${index},My notes,noun`,
    ).join("\n");
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles({
      name: "large-vocabulary.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(text),
    });
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("1001 rows");
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Add to Smart Inbox", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Continue to Smart Inbox", exact: true })
    .click();
  await expect(page.getByText(/1001 matching rows/u)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  await page
    .getByRole("checkbox", { name: "Select these 30 rows", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Accept selected", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("accepted");
  await expect(page.getByText(/30 matching rows/u)).toBeVisible();
  const meaning = page.getByLabel("Meaning for linger, row 2", { exact: true });
  await meaning.selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Add chosen meaning to study", exact: true })
    .click();
  const learning = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.learning.v1")!),
  );
  expect(learning.saved).toHaveLength(1);
  expect(learning.evidence).toHaveLength(0);
  await page.reload();
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("accepted");
  await expect(
    page.getByText(
      "Selected meaning is saved for study. Your separate practice history is preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Roll back import", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("lexis.learning.v1")!).saved.length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.materials.v1")!).batches[0]
          .rolledBackAt,
    ),
  ).toBeTruthy();
});

test("real XLSX values import and corrupt files leave saved data intact", async ({
  page,
}) => {
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Vocabulary list", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles(fixture("original-vocabulary.xlsx"));
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("linger");
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Add to Smart Inbox", exact: true })
    .click();
  const previous = await page.evaluate(() =>
    localStorage.getItem("lexis.materials.v1"),
  );
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles({
      name: "broken.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("not a zip"),
    });
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("alert", { name: "Import error", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.materials.v1")),
  ).toBe(previous);
});
