import { expect, test } from "@playwright/test";

test("Reader Quick to Full and Deep preserves source, separate senses and return selection", async ({
  page,
}) => {
  await page.goto("/reader");
  const token = page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first();
  const tokenId = await token.getAttribute("id");
  await token.click();
  const quick = page.getByRole("dialog", { name: "Dictionary", exact: true });
  await quick.getByRole("radio").first().check();
  const originalContext = await quick.locator("blockquote").textContent();
  await quick
    .getByRole("button", { name: "Open full entry", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dictionary\?/);
  expect(page.url()).not.toContain("Some+mornings");
  await expect(
    page.getByRole("complementary", { name: "Original lookup context" }),
  ).toContainText(originalContext!.replace(/[“”]/g, "").trim());
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page
    .getByRole("button", { name: "Save selected meaning", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Meaning saved on this device",
  );
  await page.getByRole("button", { name: "Deep Dive", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meaning in use", exact: true }),
  ).toBeVisible();
  await page.getByText("Explain differently", { exact: true }).click();
  await expect(
    page.getByText("Stay a little longer instead of leaving.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Deep Dive", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page.getByRole("radio").nth(1).check();
  await page
    .getByRole("button", { name: "Save selected meaning", exact: true })
    .click();
  const durable = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.learning.v1") ?? "null"),
  );
  expect(
    durable.saved.map((item: { senseId: string }) => item.senseId),
  ).toEqual(["linger-stay", "linger-remain"]);
  expect(durable.evidence).toEqual([]);
  await page
    .getByRole("link", { name: "Return to your source", exact: true })
    .click();
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("radio").nth(1)).toBeChecked();
  await expect(quick.locator("blockquote")).toHaveText(originalContext!);
  await page.keyboard.press("Escape");
  await expect(page.locator(`#${tokenId}`)).toBeFocused();
  await expect(page.locator(`#${tokenId}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("editorial forms, POS groups and unknown input remain honest without implicit sense choice", async ({
  page,
}) => {
  await page.goto("/dictionary?q=lingered");
  await expect(
    page.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Selected form: lingered/)).toBeVisible();
  await expect(page.getByRole("radio").first()).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Save selected meaning", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Word, form, phrase or translation" })
    .fill("trace");
  await expect(
    page.getByRole("heading", { name: "noun", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "verb", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Word, form, phrase or translation" })
    .fill("unlisted-phrase");
  await expect(
    page.getByRole("heading", { name: "No local entry yet.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save selected meaning", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
});

test("a phrase selected across inline words keeps native selection until explicit lookup", async ({
  page,
}) => {
  await page.goto("/reader");
  await expect(
    page.getByRole("heading", { name: "The art of noticing", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const words = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-reader-token]"),
    );
    const start = words.find((word) => word.textContent === "deliberate")!;
    const end = words.find((word) => word.textContent === "pause")!;
    const range = document.createRange();
    range.setStart(start.firstChild!, 0);
    range.setEnd(end.firstChild!, "pause".length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const explicitLookup = page.getByRole("button", {
    name: "Look up selection: deliberate pause",
    exact: true,
  });
  await expect(explicitLookup).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "deliberate pause",
  );
  const quick = page.getByRole("dialog", { name: "Dictionary", exact: true });
  await expect(quick).not.toBeVisible();
  await explicitLookup.click();
  await expect(quick).toBeVisible();
  await expect(
    quick.getByRole("heading", { name: "deliberate pause", exact: true }),
  ).toBeVisible();
  await quick
    .getByRole("button", { name: "Search Dictionary", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Original lookup context" }),
  ).toContainText("Taking a deliberate pause can change the shape of a day.");
  await expect(
    page.getByRole("searchbox", { name: "Word, form, phrase or translation" }),
  ).toHaveValue("deliberate pause");
});
