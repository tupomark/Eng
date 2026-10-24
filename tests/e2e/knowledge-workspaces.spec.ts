import { test, expect } from "@playwright/test";

test("goals persist, stay optional and archive without fabricated progress", async ({
  page,
}) => {
  await page.goto("/goals");
  await page.getByLabel("Goal title").fill("Read everyday stories");
  await page
    .getByLabel("Your subject or context")
    .fill("Travel and everyday life");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Read everyday stories", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("0 / 5", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Read everyday stories", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive goal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Read everyday stories", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Include archived goals").check();
  await expect(
    page.getByRole("heading", { name: "Read everyday stories", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.goals.v1")!).goals[0].archived,
    ),
  ).toBe(true);
});

test("semantic links disclose their reason and return from dictionary to the same sense", async ({
  page,
}) => {
  await page.goto("/core/network?sense=linger-stay");
  await page.getByText("Why this connection?", { exact: true }).click();
  await expect(
    page.getByText(/A person can linger by choosing not to leave/),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explore linked meaning", exact: true })
    .click();
  await expect(page).toHaveURL(/sense=linger-remain/);
  await page
    .getByRole("link", { name: "Open Dictionary entry", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dictionary\?/);
  await page
    .getByRole("link", { name: "Return to your source", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/core\/network\?.*sense=linger-remain/);
  await page.getByLabel("Connection type").selectOption("synonym");
  await expect(
    page.getByText("No warranted connections match these filters.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("observatory empty state gives no proficiency estimate and filters keep it honest", async ({
  page,
}) => {
  await page.goto("/core/observatory");
  await expect(
    page.getByRole("heading", {
      name: "What was actually observed",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No repeated independent difficulty in this window.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Skill", { exact: true }).selectOption("listening");
  await expect(
    page.getByText("No observations match these filters.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search your evidence").fill("private unknown context");
  await expect(
    page.getByText("No observations match these filters.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Try a measured task", exact: true }),
  ).toBeVisible();
});
