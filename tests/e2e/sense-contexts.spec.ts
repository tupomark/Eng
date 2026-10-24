import { expect, test, type Page } from "@playwright/test";

async function openPassage(page: Page, excerpt: string) {
  const paragraph = page
    .getByRole("article", { name: "Document text" })
    .locator("p")
    .filter({ hasText: excerpt })
    .first();
  await paragraph.evaluate((node) => {
    const text = node.firstChild!;
    const offset = text.textContent!.indexOf("linger");
    const range = document.createRange();
    range.setStart(text, offset);
    range.setEnd(text, offset + 6);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page
    .getByRole("button", { name: "Look up selection: linger", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio").first().check();
}

test("two source contexts for one meaning persist/search/export/restore without changing existing learning bytes", async ({
  page,
}) => {
  const first = "We linger by the sea.";
  const second = "We linger by the quiet river.";
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles({
      name: "two-original-contexts.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(first + "\n\n" + second),
    });
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
  const reader = page.url();
  await openPassage(page, first);
  await page
    .getByRole("button", { name: "Save selected meaning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Source context saved", exact: true }),
  ).toBeDisabled();
  const original = await page.evaluate(() =>
    localStorage.getItem("lexis.learning.v1"),
  );
  await page.goto(reader);
  await openPassage(page, second);
  await page
    .getByRole("button", { name: "Save this source context", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Source context saved", exact: true }),
  ).toBeDisabled();
  await page.reload();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBe(original);
  const passages = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.sense-contexts.v1")!),
  );
  expect(passages.contexts).toHaveLength(2);
  expect(
    passages.contexts.map((item: { excerpt: string }) => item.excerpt),
  ).toEqual([first, second]);
  const learning = JSON.parse(original!);
  expect(learning.saved).toHaveLength(1);
  expect(learning.evidence).toHaveLength(0);
  await page
    .getByText("Saved passage backup and recovery", { exact: true })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export saved passages / original",
      exact: true,
    })
    .click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const bytes: Buffer[] = [];
  for await (const chunk of stream!) bytes.push(Buffer.from(chunk));
  const backup = Buffer.concat(bytes);
  expect(JSON.parse(backup.toString())).toEqual(passages);
  await page
    .getByLabel("Choose saved passage backup", { exact: true })
    .setInputFiles({
      name: "passages.json",
      mimeType: "application/json",
      buffer: backup,
    });
  await expect(page.getByText(/0 new passages\./u)).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm passage merge", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.sense-contexts.v1")!).contexts
          .length,
    ),
  ).toBe(2);
  await page.goto("/library");
  await page.getByLabel("Search saved meanings").fill("quiet river");
  await expect(
    page.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await page.getByText("Saved source passages (2)", { exact: true }).click();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBe(original);
});
