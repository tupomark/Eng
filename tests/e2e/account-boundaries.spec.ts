import { expect, test } from "@playwright/test";

test("account clearly awaits configuration while local learning remains available", async ({
  page,
  request,
}) => {
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Account sign-in awaits configuration.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Signing in does not upload books", { exact: false }),
  ).toBeVisible();
  const status = await request.get("/api/account");
  expect(status.ok()).toBe(true);
  expect(status.headers()["cache-control"]).toContain("no-store");
  expect(await status.json()).toMatchObject({
    configured: false,
    user: null,
    cloudLearning: false,
  });
  await page
    .getByRole("link", { name: "Open local history and export" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Understanding, in its own time." }),
  ).toBeVisible();
});

test("account and cloud commands reject foreign origins and never imply an unconfigured save succeeded", async ({
  request,
  baseURL,
}) => {
  const foreign = await request.post("/api/account", {
    headers: { Origin: "https://unrelated.example" },
    data: { action: "sign-out" },
  });
  expect(foreign.status()).toBe(403);
  const origin = new URL(baseURL!).origin;
  const own = await request.post("/api/learning/command", {
    headers: { Origin: origin },
    data: {
      type: "archive-sense",
      key: "fixture-command",
      senseId: "linger-stay",
      expectedRevision: 0,
    },
  });
  expect(own.status()).toBe(503);
  expect(await own.json()).toMatchObject({
    ok: false,
    status: "awaiting-configuration",
  });
  expect(own.headers()["cache-control"]).toContain("no-store");
});

test("invalid Auth callback cannot redirect to an external destination", async ({
  page,
}) => {
  await page.goto("/auth/callback?next=https://unrelated.example");
  await expect(page).toHaveURL(/\/account\?notice=callback-incomplete$/);
  await expect(page.getByRole("alert")).toContainText(
    "sign-in link could not be completed",
  );
});
