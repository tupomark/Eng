import { expect, test } from "@playwright/test";

test("a learning backup previews, restores and repeats without duplicating original history", async ({
  page,
}) => {
  const backup = {
    version: 1,
    readerProgress: 38,
    saved: [
      {
        senseId: "original-unavailable",
        context: "The context survives a provider change.",
        savedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "legacy-id-not-uuid",
        senseId: "original-unavailable",
        skill: "recognition",
        source: "self-review",
        rating: "good",
        occurredAt: "2026-10-21T00:00:00.000Z",
        disputedAt: "2026-10-22T00:00:00.000Z",
      },
    ],
  };
  await page.goto("/core/restore");
  await page
    .getByRole("button", { name: "Choose learning backup", exact: true })
    .setInputFiles({
      name: "history.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    page.getByRole("heading", { name: "Preview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm merge" }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download current backup" }).click();
  await download;
  await page.getByRole("button", { name: "Confirm merge" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Learning history restored",
  );
  await page.reload();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lexis.learning.v1")!),
    ),
  ).toEqual(backup);
  await page
    .getByRole("button", { name: "Choose learning backup", exact: true })
    .setInputFiles({
      name: "history-again.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    page.getByText(
      "0 new meanings · 0 new observations · 1 already present observations.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Unavailable meaning", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(backup.saved[0].context, { exact: true }),
  ).toBeVisible();
});

test("an invalid restore preserves existing raw bytes", async ({ page }) => {
  await page.goto("/core/restore");
  const before = await page.evaluate(() =>
    localStorage.getItem("lexis.learning.v1"),
  );
  await page
    .getByRole("button", { name: "Choose learning backup", exact: true })
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
  await expect(
    page.getByRole("alert").filter({ hasText: "not a valid supported" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBe(before);
  await expect(page.getByRole("button", { name: "Confirm merge" })).toHaveCount(
    0,
  );
});
