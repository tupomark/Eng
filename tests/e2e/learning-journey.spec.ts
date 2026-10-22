import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "lexis.learning.v1";

async function openFirstMeaning(page: Page) {
  await page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first()
    .click();
  const dictionary = page.getByRole("dialog", {
    name: "Dictionary",
    exact: true,
  });
  await expect(dictionary).toBeVisible();
  await dictionary.getByRole("radio").first().check();
  return dictionary;
}

async function saveFromHome(page: Page) {
  await page.goto("/");
  await page
    .getByRole("link", { name: /^(Start|Continue) reading/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "The art of noticing", exact: true }),
  ).toBeVisible();
  const dictionary = await openFirstMeaning(page);
  await dictionary.getByRole("button", { name: /Save this meaning/ }).click();
  await expect(dictionary.getByRole("status")).toContainText(
    "saved on this device",
  );
  await expect(
    dictionary.getByRole("button", { name: "Saved to your core" }),
  ).toBeDisabled();
  return dictionary;
}

test("a saved meaning reaches review, survives reload and can have its evidence disputed", async ({
  page,
}) => {
  const dictionary = await saveFromHome(page);
  await dictionary.getByRole("link", { name: "Go to Smart Review" }).click();
  await expect(
    page.getByRole("region", { name: "Meaning recognition review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show meaning" }).click();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(
    page.getByRole("heading", { name: "A little more familiar.", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "You are up to date.", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "See your learning evidence" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Understanding,",
  );
  await expect(
    page.getByLabel("Recognition estimate", { exact: true }),
  ).toHaveText("Tentative");
  await expect(page.getByLabel("Writing estimate", { exact: true })).toHaveText(
    "—",
  );
  await expect(
    page.getByLabel("Speaking estimate", { exact: true }),
  ).toHaveText("—");

  const durableBefore = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(durableBefore.saved).toHaveLength(1);
  expect(durableBefore.evidence).toHaveLength(1);
  expect(durableBefore.evidence[0]).toMatchObject({
    senseId: "linger-stay",
    skill: "recognition",
    source: "self-review",
    rating: "good",
  });
  expect(
    durableBefore.evidence.some(
      (event: { skill: string }) =>
        event.skill === "writing" || event.skill === "speaking",
    ),
  ).toBe(false);

  await page
    .getByRole("button", { name: "Dispute this rating", exact: true })
    .click();
  await expect(
    page.getByText("Excluded from estimates", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Recognition estimate", { exact: true }),
  ).toHaveText("—");
  await page.reload();
  await expect(
    page.getByText("Excluded from estimates", { exact: true }),
  ).toBeVisible();
  const durableAfter = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(durableAfter.evidence).toHaveLength(1);
  expect(durableAfter.evidence[0].disputedAt).toBeTruthy();

  await page.goto("/learn");
  await expect(
    page.getByRole("region", { name: "Meaning recognition review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show meaning" }),
  ).toBeVisible();
});

test("reopening a saved meaning keeps one copy and does not fabricate learning evidence", async ({
  page,
}) => {
  const dictionary = await saveFromHome(page);
  await dictionary.getByRole("button", { name: "Close dialog" }).click();
  await openFirstMeaning(page);
  await expect(
    page.getByRole("button", { name: "Saved to your core" }),
  ).toBeDisabled();
  await page.reload();
  const reopened = await openFirstMeaning(page);
  await expect(
    reopened.getByRole("button", { name: "Saved to your core" }),
  ).toBeDisabled();
  await expect(
    reopened.getByRole("button", { name: "Undo save", exact: true }),
  ).toHaveCount(0);
  const durable = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(durable.saved).toHaveLength(1);
  expect(durable.evidence).toEqual([]);
});

test("dictionary details are optional and an unreviewed fresh save can be undone without removing history", async ({
  page,
}) => {
  const dictionary = await saveFromHome(page);
  const example = dictionary.getByText(
    "We lingered by the window as the afternoon light faded.",
    { exact: true },
  );
  await expect(example).not.toBeVisible();
  await dictionary.getByText("Explore this meaning", { exact: true }).click();
  await expect(example).toBeVisible();
  await expect(dictionary.locator(".dictionary-provenance")).toContainText(
    "Offline editorial sample",
  );
  await expect(dictionary.locator(".dictionary-provenance")).toContainText(
    "editorial-v1",
  );
  await expect(dictionary.locator(".dictionary-provenance")).toContainText(
    "audio is not included",
  );

  await dictionary.getByRole("link", { name: "Go to Smart Review" }).click();
  await page.getByRole("button", { name: "Show meaning" }).click();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(
    page.getByRole("heading", { name: "A little more familiar.", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );

  await page.goto("/reader");
  await page
    .getByRole("button", { name: "Look up stillness", exact: true })
    .first()
    .click();
  await dictionary.getByRole("button", { name: /Save this meaning/ }).click();
  await expect(
    dictionary.getByRole("button", { name: "Undo save", exact: true }),
  ).toBeVisible();
  const afterSave = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(afterSave.saved).toHaveLength(2);
  expect(afterSave.evidence).toEqual(before.evidence);
  await dictionary
    .getByRole("button", { name: "Undo save", exact: true })
    .click();
  await expect(dictionary.getByRole("status")).toContainText(
    "Meaning removed from your study pool.",
  );
  await expect(
    dictionary.getByRole("button", { name: /Save this meaning/ }),
  ).toBeEnabled();
  const afterUndo = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(afterUndo).toEqual(before);
  await dictionary
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await openFirstMeaning(page);
  await expect(
    dictionary.getByRole("button", { name: "Undo save", exact: true }),
  ).toHaveCount(0);
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "You are up to date.", exact: true }),
  ).toBeVisible();
});

test("an unavailable saved meaning does not block the next available review", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const savedAt = new Date(Date.now() - 60_000).toISOString();
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        readerProgress: 0,
        saved: [
          {
            senseId: "unavailable-meaning",
            context: "A preserved learning context.",
            savedAt,
          },
          {
            senseId: "linger-stay",
            context: "Some mornings invite us to linger.",
            savedAt,
          },
        ],
        evidence: [],
      }),
    );
  }, STORAGE_KEY);
  await page.goto("/learn");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "unavailable in this dictionary version" }),
  ).toBeVisible();
  const review = page.getByRole("region", {
    name: "Meaning recognition review",
  });
  await expect(
    review.getByRole("heading", { name: "linger", exact: true }),
  ).toBeVisible();
  await review.getByRole("button", { name: "Show meaning" }).click();
  await review.getByRole("button", { name: /^Good/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Some meanings are unavailable.",
      exact: true,
    }),
  ).toBeVisible();
  const durable = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(durable.saved).toHaveLength(2);
  expect(durable.saved[0].senseId).toBe("unavailable-meaning");
  expect(durable.evidence).toHaveLength(1);
  expect(durable.evidence[0].senseId).toBe("linger-stay");
});

test("unknown words explain dictionary coverage and Escape restores keyboard focus", async ({
  page,
}) => {
  await page.goto("/reader");
  await expect(
    page.getByRole("heading", { name: "The art of noticing", exact: true }),
  ).toBeVisible();
  const unknown = page
    .getByRole("button", { name: "Look up Some", exact: true })
    .first();
  await unknown.focus();
  await unknown.press("Enter");
  const dictionary = page.getByRole("dialog", {
    name: "Dictionary",
    exact: true,
  });
  await expect(dictionary).toBeVisible();
  await expect(dictionary).toContainText(
    "not included in the first reading dictionary yet",
  );
  await expect(
    dictionary.getByRole("button", { name: /Save this meaning/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dictionary).not.toBeVisible();
  await expect(unknown).toBeFocused();

  const known = page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first();
  await known.focus();
  await known.press("Enter");
  await expect(dictionary).toBeVisible();
  await expect(
    dictionary.getByRole("button", { name: /Save this meaning/ }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(known).toBeFocused();
});

test("LEXIS Command opens from the keyboard, searches words and navigates to Learn", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Open LEXIS Command",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const command = page.getByRole("dialog", {
    name: "LEXIS Command",
    exact: true,
  });
  await expect(command).toBeVisible();
  const search = command.getByRole("textbox", {
    name: "Search LEXIS",
    exact: true,
  });
  await search.fill("unlistedword");
  await expect(command).toContainText("No matching spaces or words");
  await search.fill("wander");
  await command.getByRole("button", { name: /^wander/ }).click();
  await expect(command).toContainText("without a fixed route or destination");
  for (let repeat = 0; repeat < 3; repeat += 1) {
    await page.keyboard.press("Escape");
    await expect(command).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(command).toBeVisible();
    await expect(search).toHaveValue("wander");
    await expect(command).toContainText("without a fixed route or destination");
  }
  await search.fill("Learn");
  await command
    .getByRole("button", { name: "Open Learn", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make it familiar.", exact: true }),
  ).toBeVisible();
});

test("local corruption is reported without overwriting the original data", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    (key) => localStorage.setItem(key, "{unreadable learning data"),
    STORAGE_KEY,
  );
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be opened" }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe("{unreadable learning data");
});

test("a failed browser write reports the error and does not claim the meaning was saved", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key)
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      original.call(this, storageKey, value);
    };
  }, STORAGE_KEY);
  await page.goto("/reader");
  const dictionary = await openFirstMeaning(page);
  await dictionary.getByRole("button", { name: /Save this meaning/ }).click();
  await expect(dictionary.getByRole("alert")).toContainText(
    "could not be saved",
  );
  await expect(
    dictionary.getByRole("button", { name: /Save this meaning/ }),
  ).toBeEnabled();
  await expect(
    dictionary.getByRole("button", { name: "Saved to your core" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
});

test("navigation and reader fit the viewport with reduced motion enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  const visibleNav = page.getByRole("navigation", {
    name: mobile ? "Mobile navigation" : "Main navigation",
    exact: true,
  });
  await expect(visibleNav).toBeVisible();
  for (const label of ["Home", "Library", "Learn", "Tutor", "Core"]) {
    await expect(
      visibleNav.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto("/reader");
  await expect(
    page.getByRole("heading", { name: "The art of noticing", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation", exact: true }),
  ).toHaveCount(0);
});
