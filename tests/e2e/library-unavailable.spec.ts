import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "lexis.learning.v1";
const unavailable = {
  senseId: "legacy-неизвестное-значение",
  context: "An unavailable meaning still has this preserved riverside context.",
  savedAt: "2026-10-20T12:00:00.000Z",
};
const available = {
  senseId: "linger-stay",
  context: "Some mornings invite us to linger near the window.",
  savedAt: "2026-10-20T12:00:01.000Z",
};
const evidence = {
  id: "legacy-review-event",
  senseId: unavailable.senseId,
  skill: "recognition",
  rating: "good",
  occurredAt: "2026-10-21T12:00:00.000Z",
  source: "self-review",
};

function fixture(saved: (typeof unavailable)[]) {
  return { version: 1, readerProgress: 42, saved, evidence: [evidence] };
}

async function openFixture(page: Page, state: ReturnType<typeof fixture>) {
  await page.goto("/");
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state },
  );
  await page.goto("/library");
}

async function expectStoredAndExported(
  page: Page,
  state: ReturnType<typeof fixture>,
) {
  await page.reload();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
      STORAGE_KEY,
    ),
  ).toEqual(state);
  await page.goto("/core");
  await expect(
    page.getByText(unavailable.senseId, { exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export local data" }).click();
  const download = await downloadEvent;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  expect(JSON.parse(await readFile(filePath!, "utf8"))).toEqual(state);
}

test("an unavailable-only collection keeps its record, context and exported history", async ({
  page,
}) => {
  const state = fixture([unavailable]);
  await openFixture(page, state);
  await expect(
    page
      .getByRole("heading", { name: "Your meanings 1", exact: true })
      .locator(".count-label"),
  ).toHaveText("1");
  const card = page.locator("article.meaning-card");
  await expect(card).toHaveCount(1);
  await expect(
    card.getByRole("heading", { name: "Unavailable meaning" }),
  ).toBeVisible();
  await expect(card).toContainText("Unavailable in this dictionary version");
  await expect(card).toContainText(unavailable.context);
  await expect(card).toContainText(unavailable.senseId);
  await expect(
    card.getByRole("link", { name: "Open history & data export" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your collection begins with curiosity.",
    }),
  ).toHaveCount(0);

  await expectStoredAndExported(page, state);
  await page.goto("/library");
  await expect(page.locator("article.meaning-card")).toHaveCount(1);
  await expect(page.locator("article.meaning-card")).toContainText(
    unavailable.context,
  );
});

test("a mixed collection searches unavailable metadata and contexts without changing totals or data", async ({
  page,
}) => {
  const state = fixture([unavailable, available]);
  await openFixture(page, state);
  await expect(
    page
      .getByRole("heading", { name: "Your meanings 2", exact: true })
      .locator(".count-label"),
  ).toHaveText("2");
  const cards = page.locator("article.meaning-card");
  await expect(cards).toHaveCount(2);
  const search = page.getByRole("textbox", { name: "Search saved meanings" });
  await search.fill("RIVERSIDE");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Unavailable meaning");
  await search.fill("неизвестное");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(unavailable.senseId);
  await search.fill("linger");
  await expect(cards).toHaveCount(1);
  await expect(
    cards.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await search.fill("window");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(available.context);
  await search.fill("no-such-meaning");
  await expect(cards).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No meanings match yet." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Your meanings 2", exact: true })
      .locator(".count-label"),
  ).toHaveText("2");
  await search.fill("   ");
  await expect(cards).toHaveCount(2);
  await expectStoredAndExported(page, state);
  await page.goto("/library");
  await expect(cards).toHaveCount(2);
});
