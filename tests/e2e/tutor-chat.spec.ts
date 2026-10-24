import { expect, test } from "@playwright/test";

test("a private local Tutor question survives unavailable AI, refresh, session settings and export", async ({
  page,
}) => {
  await page.goto("/tutor/chat");
  await expect(
    page.getByRole("region", { name: "Tutor capability" }),
  ).toContainText("awaiting configuration");
  const composer = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  await expect(composer).toBeVisible();
  await page
    .getByLabel("Teaching style", { exact: true })
    .selectOption("examiner");
  await page
    .getByLabel("Session type", { exact: true })
    .selectOption("knowledge-check");
  await composer.fill("Can you help me understand the two meanings of trace?");
  await page
    .getByText("Context & processing permission", { exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Allow the configured AI provider/ })
    .check();
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "AI tutoring is not configured" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Tutor conversation" }),
  ).toContainText("Can you help me understand");
  await expect(
    page.getByRole("region", { name: "Tutor conversation" }),
  ).not.toContainText("AI GUIDANCE");
  await expect(composer).toHaveValue(
    "Can you help me understand the two meanings of trace?",
  );
  await page.reload();
  await expect(composer).toHaveValue(
    "Can you help me understand the two meanings of trace?",
  );
  await expect(page.getByLabel("Teaching style", { exact: true })).toHaveValue(
    "examiner",
  );
  await expect(page.getByLabel("Session type", { exact: true })).toHaveValue(
    "knowledge-check",
  );
  await expect(
    page.getByRole("button", {
      name: "Check the saved request again",
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Tutor data", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("lexis-tutor-local.json");
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
});

test("Reader context is visible locally but is omitted from the request until separately allowed", async ({
  page,
}) => {
  await page.goto("/reader");
  await page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Dictionary", exact: true })
    .getByRole("button", { name: "Ask Tutor about this passage", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tutor\/chat\?/);
  await expect(
    page.getByText("Some mornings invite us to linger.", { exact: true }),
  ).toBeVisible();
  const contextPermission = page.getByRole("checkbox", {
    name: /Include only this selected passage/,
  });
  await expect(contextPermission).not.toBeChecked();
  await page
    .getByRole("textbox", { name: "Your question", exact: true })
    .fill("Explain the difference.");
  await page
    .getByRole("checkbox", { name: /Allow the configured AI provider/ })
    .check();
  const firstRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/tutor/message") &&
      request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  expect((await firstRequest).postDataJSON().context).toBeNull();
  await expect(
    page.getByRole("button", { name: "Send question", exact: true }),
  ).toBeEnabled();
  await contextPermission.check();
  const secondRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/tutor/message") &&
      request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  const sent = (await secondRequest).postDataJSON();
  expect(sent.context.excerpt).toContain("Some mornings invite us to linger.");
  expect(sent.history).toEqual([]);
  await page
    .getByRole("link", { name: "Return to your source", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Dictionary", exact: true }),
  ).toBeVisible();
});

test("cancelling a pending request keeps the question and ignores a late transport reply", async ({
  page,
}) => {
  await page.route("**/api/tutor/message", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "provider-failure",
          message: "Fixture transport failure",
        }),
      });
    } catch {
      /* cancelled browser request */
    }
  });
  await page.goto("/tutor/chat");
  const composer = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  await expect(composer).toBeVisible();
  await composer.fill("Keep this question after cancellation.");
  await page
    .getByText("Context & processing permission", { exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Allow the configured AI provider/ })
    .check();
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Request cancelled" }),
  ).toBeVisible();
  await expect(composer).toHaveValue("Keep this question after cancellation.");
  await page.reload();
  await expect(composer).toHaveValue("Keep this question after cancellation.");
  await expect(
    page.getByRole("region", { name: "Tutor conversation" }),
  ).not.toContainText("AI GUIDANCE");
});

test("revoking processing permission cancels the active request without losing the draft", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/tutor/message", async (route) => {
    await pending;
    try {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "provider-failure",
          message: "Late fixture response",
        }),
      });
    } catch {
      /* request was cancelled */
    }
  });
  await page.goto("/tutor/chat");
  const composer = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  await composer.fill("Keep this draft after withdrawing permission.");
  await page
    .getByText("Context & processing permission", { exact: true })
    .click();
  const permission = page.getByRole("checkbox", {
    name: /Allow the configured AI provider/,
  });
  await permission.check();
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel request", exact: true }),
  ).toBeVisible();
  await permission.uncheck();
  await expect(
    page.getByRole("status").filter({ hasText: "Request cancelled" }),
  ).toBeVisible();
  release();
  await expect(composer).toHaveValue(
    "Keep this draft after withdrawing permission.",
  );
  await expect(
    page.getByRole("region", { name: "Tutor conversation" }),
  ).not.toContainText("AI GUIDANCE");
  await expect(
    page.getByRole("button", { name: "Send question", exact: true }),
  ).toBeDisabled();
});

test("AI endpoints reject foreign origins, forged assessment metadata and unavailable server-cache deletion", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const foreign = await request.post("/api/tutor/message", {
    headers: { Origin: "https://unrelated.example" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  const forged = await request.post("/api/ai/verify", {
    headers: { Origin: origin },
    data: {
      requestId: "forged-1",
      senseId: "linger-stay",
      answer: "A sentence.",
      assisted: false,
      provider: "forged",
      score: 100,
    },
  });
  expect(forged.status()).toBe(422);
  expect(await forged.json()).toMatchObject({
    ok: false,
    evidenceSaved: false,
  });
  const deletion = await request.post("/api/ai/replies", {
    headers: { Origin: origin },
    data: {
      confirmation: "CLEAR AI REPLY CACHE",
      expectedUserId: "11000000-0000-4000-8000-000000000001",
    },
  });
  expect(deletion.status()).toBe(503);
  expect(deletion.headers()["cache-control"]).toContain("no-store");
  expect(await deletion.json()).toMatchObject({ ok: false });
});
