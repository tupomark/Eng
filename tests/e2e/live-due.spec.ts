import { expect, test } from "@playwright/test";

test("Home due wakes at the deadline and stays consistent across Learn and Core after background/date changes", async ({
  page,
}) => {
  const start = new Date("2026-10-22T23:59:50Z");
  await page.clock.install({ time: start });
  await page.addInitScript((initial) => {
    if (localStorage.getItem("lexis.learning.v1")) return;
    localStorage.setItem(
      "lexis.learning.v1",
      JSON.stringify({
        version: 1,
        readerProgress: 0,
        saved: [
          {
            senseId: "linger-stay",
            context: "We linger by the window.",
            savedAt: "2026-10-22T22:00:00Z",
          },
        ],
        evidence: [
          {
            id: "clock-review",
            senseId: "linger-stay",
            skill: "recognition",
            rating: "again",
            source: "self-review",
            occurredAt: new Date(initial - 585_000).toISOString(),
          },
        ],
      }),
    );
  }, start.getTime());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little, often.", exact: true }),
  ).toBeVisible();
  await page.clock.runFor(16_000);
  await expect(
    page.getByRole("heading", { name: "1 meaning to revisit", exact: true }),
  ).toBeVisible();
  await page.goto("/core");
  await expect(page.getByLabel("Review due count")).toHaveText(
    "1 meanings due for review",
  );
  await page.goto("/learn");
  await expect(
    page.getByRole("region", { name: "Meaning recognition review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show meaning" }).click();
  await page.getByRole("button", { name: /^Good/ }).click();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little, often.", exact: true }),
  ).toBeVisible();
  await page.clock.setSystemTime(new Date("2026-10-26T01:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "1 meaning to revisit", exact: true }),
  ).toBeVisible();
  await page.goto("/core");
  await expect(page.getByLabel("Review due count")).toHaveText(
    "1 meanings due for review",
  );
});
