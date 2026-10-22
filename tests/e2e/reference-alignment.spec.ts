import { expect, test, type Locator, type Page } from "@playwright/test";

const LEARNING_KEY = "lexis.learning.v1";
const PREFERENCES_KEY = "lexis.reader.preferences.v1";

async function learningBytes(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY);
}

async function seedLearning(page: Page) {
  await page.goto("/reader");
  await expect(
    page.getByRole("heading", { name: "The art of noticing", exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          saved: [
            {
              senseId: "linger-stay",
              context: "Some mornings invite us to linger.",
              savedAt: "2026-10-21T12:00:00.000Z",
            },
          ],
          evidence: [],
          readerProgress: 0,
        }),
      ),
    LEARNING_KEY,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The art of noticing", exact: true }),
  ).toBeVisible();
}

async function expectComfortableTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(43.5);
  expect(bounds!.height).toBeGreaterThanOrEqual(43.5);
}

test("Reader defaults to sans and persists type, size and spacing separately from learning data", async ({
  page,
}) => {
  await seedLearning(page);
  const before = await learningBytes(page);
  const body = page.locator(".reader-body");
  await expect(body).toHaveAttribute("data-reader-font", "sans");
  await page
    .getByRole("button", { name: "Reading options", exact: true })
    .click();
  const options = page.getByRole("dialog", {
    name: "Reading options",
    exact: true,
  });
  await expect(
    options.getByRole("radio", { name: "Sans serif", exact: true }),
  ).toBeChecked();
  await options.getByRole("radio", { name: "Serif", exact: true }).check();
  await options.getByRole("radio", { name: "Large · 23", exact: true }).check();
  await options.getByRole("radio", { name: "Roomy", exact: true }).check();
  await options
    .getByRole("button", { name: "Back to reading", exact: true })
    .click();
  await expect(body).toHaveAttribute("data-reader-font", "serif");
  await expect(page.locator(".reader-paragraph").first()).toHaveCSS(
    "font-size",
    "23px",
  );
  await expect(page.locator(".reader-paragraph").first()).toHaveCSS(
    "line-height",
    "46px",
  );
  expect(await learningBytes(page)).toBe(before);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
      PREFERENCES_KEY,
    ),
  ).toEqual({ version: 1, font: "serif", fontSize: 23, lineSpacing: "roomy" });
  await page.reload();
  await expect(body).toHaveAttribute("data-reader-font", "serif");
  await expect(page.locator(".reader-paragraph").first()).toHaveCSS(
    "font-size",
    "23px",
  );
  await expect(page.locator(".reader-paragraph").first()).toHaveCSS(
    "line-height",
    "46px",
  );
  expect(await learningBytes(page)).toBe(before);
});

test("invalid reading preferences are preserved until reset and failed preference writes stay visible", async ({
  page,
}) => {
  await seedLearning(page);
  const before = await learningBytes(page);
  const invalid = JSON.stringify({
    version: 9,
    font: "unrecognised",
    fontSize: -50,
    lineSpacing: "roomy",
  });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: PREFERENCES_KEY,
    value: invalid,
  });
  await page.reload();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Saved reading options could not be opened" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reading options", exact: true })
    .click();
  const options = page.getByRole("dialog", {
    name: "Reading options",
    exact: true,
  });
  await options.getByRole("radio", { name: "Serif", exact: true }).check();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), PREFERENCES_KEY),
  ).toBe(invalid);
  await options
    .getByRole("button", { name: "Reset reading options", exact: true })
    .click();
  await expect(
    options.getByRole("radio", { name: "Sans serif", exact: true }),
  ).toBeChecked();
  const defaultBytes = await page.evaluate(
    (key) => localStorage.getItem(key),
    PREFERENCES_KEY,
  );
  expect(JSON.parse(defaultBytes!)).toEqual({
    version: 1,
    font: "sans",
    fontSize: 20,
    lineSpacing: "comfortable",
  });

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key)
        throw new DOMException(
          "Preference storage unavailable",
          "QuotaExceededError",
        );
      return original.call(this, storageKey, value);
    };
  }, PREFERENCES_KEY);
  await options.getByRole("radio", { name: "Roomy", exact: true }).check();
  await expect(options.getByRole("alert")).toContainText("could not be saved");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), PREFERENCES_KEY),
  ).toBe(defaultBytes);
  await options
    .getByRole("button", { name: "Back to reading", exact: true })
    .click();
  await expect(page.locator(".reader-paragraph").first()).toHaveCSS(
    "line-height",
    "40px",
  );
  expect(await learningBytes(page)).toBe(before);
});

test("native selection remains available until explicit lookup and the selected word stays highlighted", async ({
  page,
}) => {
  await page.goto("/reader");
  const word = page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first();
  await expect(word).toBeVisible();
  await word.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  const selectionAction = page.getByRole("button", {
    name: "Look up selection: linger",
    exact: true,
  });
  await expect(selectionAction).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "linger",
  );
  const dictionary = page.getByRole("dialog", {
    name: "Dictionary",
    exact: true,
  });
  await expect(dictionary).not.toBeVisible();
  await selectionAction.click();
  await expect(dictionary).toBeVisible();
  await expect(dictionary.getByRole("radio")).toHaveCount(2);
  await dictionary
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(word).toHaveAttribute("aria-pressed", "true");
  await expect(word).toHaveClass(/reader-word-selected/);
});

test("all Voice states are explicit previews and pause without microphone or learning writes", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const counters = window as unknown as {
      __lexisMediaRequests: number;
      __lexisLearningWrites: number;
    };
    counters.__lexisMediaRequests = 0;
    counters.__lexisLearningWrites = 0;
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        counters.__lexisMediaRequests += 1;
        throw new DOMException(
          "Microphone not available in visual preview",
          "NotAllowedError",
        );
      };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key) counters.__lexisLearningWrites += 1;
      return original.call(this, storageKey, value);
    };
  }, LEARNING_KEY);
  await page.goto("/tutor");
  await expect(
    page.getByText("State preview · no recording", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This visual prototype does not record, listen, speak or assess speech.",
      { exact: true },
    ),
  ).toBeVisible();
  const before = await learningBytes(page);
  const select = page.getByRole("combobox", {
    name: "Preview voice state",
    exact: true,
  });
  const orb = page.locator(".orb-scene.voice");
  for (const state of [
    "idle",
    "listening",
    "processing",
    "speaking",
    "paused",
    "error",
  ]) {
    await select.selectOption(state);
    await expect(page.getByRole("status")).toHaveText(`Preview: ${state}`);
    await expect(orb).toHaveAttribute("data-voice-state", state);
  }
  await page
    .getByRole("button", { name: "Reset preview", exact: true })
    .click();
  await expect(select).toHaveValue("idle");
  await select.selectOption("speaking");
  await page
    .getByRole("button", { name: "Pause preview", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Preview: paused");
  await expect(orb).toHaveAttribute("data-motion", "paused");
  expect(
    await orb.locator(".membrane").evaluateAll((elements) =>
      elements.every((element) => {
        const style = getComputedStyle(element);
        return (
          style.animationName === "none" ||
          style.animationPlayState === "paused"
        );
      }),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Resume preview", exact: true })
    .click();
  await expect(select).toHaveValue("speaking");
  expect(await learningBytes(page)).toBe(before);
  expect(
    await page.evaluate(() => ({
      media: (window as unknown as { __lexisMediaRequests: number })
        .__lexisMediaRequests,
      writes: (window as unknown as { __lexisLearningWrites: number })
        .__lexisLearningWrites,
    })),
  ).toEqual({ media: 0, writes: 0 });
});

test("navigation, Reader options, dictionary actions and Voice controls have comfortable targets", async ({
  page,
}) => {
  await page.goto("/");
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  const navigation = page.getByRole("navigation", {
    name: mobile ? "Mobile navigation" : "Main navigation",
    exact: true,
  });
  for (const name of ["Home", "Library", "Learn", "Tutor", "Core"])
    await expectComfortableTarget(
      navigation.getByRole("link", { name, exact: true }),
    );
  await page.goto("/reader");
  await expectComfortableTarget(
    page.getByRole("link", {
      name: "Leave reader and return home",
      exact: true,
    }),
  );
  const trigger = page.getByRole("button", {
    name: "Reading options",
    exact: true,
  });
  await expectComfortableTarget(trigger);
  await trigger.click();
  const options = page.getByRole("dialog", {
    name: "Reading options",
    exact: true,
  });
  for (const choice of await options.locator(".reader-option-choice").all())
    await expectComfortableTarget(choice);
  await expectComfortableTarget(
    options.getByRole("button", { name: "Close dialog", exact: true }),
  );
  await options
    .getByRole("button", { name: "Back to reading", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first()
    .click();
  const dictionary = page.getByRole("dialog", {
    name: "Dictionary",
    exact: true,
  });
  for (const choice of await dictionary.locator(".dictionary-sense").all())
    await expectComfortableTarget(choice);
  await dictionary.getByRole("radio").first().check();
  await expectComfortableTarget(
    dictionary.getByRole("button", { name: /Save this meaning/ }),
  );
  await expectComfortableTarget(dictionary.locator("summary"));
  await page.goto("/tutor");
  await expectComfortableTarget(
    page.getByRole("combobox", { name: "Preview voice state", exact: true }),
  );
  await expectComfortableTarget(
    page.getByRole("button", { name: "Pause preview", exact: true }),
  );
});

test("working screens do not request the supplied reference images as interface assets", async ({
  page,
}) => {
  const referenceRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /references\/2026-10-22-light|contact_sheet|LEXIS_COMPLETE_CODEX_BRIEF/i.test(
        request.url(),
      )
    )
      referenceRequests.push(request.url());
  });
  for (const route of ["/", "/reader", "/core", "/tutor"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(referenceRequests).toEqual([]);
});
