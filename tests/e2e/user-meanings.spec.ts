import { expect, test, type Page } from "@playwright/test";
import type { UserLexicalCatalog } from "../../src/domain/lexical-catalog";
import type { TaskLearningState } from "../../src/domain/tasks/state";

const CATALOG_KEY = "lexis.lexical-catalog.v1";
const nounDefinition = "A sheltered place where boats can stop.";
const secondDefinition = "A place that gives someone safety from danger.";
const verbDefinition = "To keep a thought privately for a time.";

async function readCatalog(page: Page): Promise<UserLexicalCatalog> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    CATALOG_KEY,
  );
}

async function createMeaning(
  page: Page,
  input: {
    definition: string;
    lemma?: string;
    partOfSpeech?: "noun" | "verb";
    appendTo?: string;
    forms?: string;
    example?: string;
  },
) {
  const form = page
    .getByRole("main")
    .getByRole("form", { name: "Describe your own meaning", exact: true });
  if (input.appendTo) {
    await form
      .getByRole("combobox", { name: "Meaning belongs to", exact: true })
      .selectOption(input.appendTo);
  } else {
    await form
      .getByRole("combobox", { name: "Meaning belongs to", exact: true })
      .selectOption("");
    await form
      .getByRole("textbox", { name: "English word or expression", exact: true })
      .fill(input.lemma ?? "harbour");
    await form
      .getByRole("combobox", { name: "Part of speech", exact: true })
      .selectOption(input.partOfSpeech ?? "noun");
  }
  await form
    .getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    })
    .fill(input.definition);
  if (input.forms || input.example) {
    const optional = form.locator("details");
    if (
      !(await optional.evaluate((details: HTMLDetailsElement) => details.open))
    )
      await form
        .getByText("Translation, example and optional details", { exact: true })
        .click();
    if (input.forms)
      await form
        .getByRole("textbox", {
          name: "Explicit word forms (optional, separated by commas)",
          exact: true,
        })
        .fill(input.forms);
    if (input.example)
      await form
        .getByRole("textbox", {
          name: "Your example in English (optional)",
          exact: true,
        })
        .fill(input.example);
  }
  await form
    .getByRole("button", { name: "Create user-authored meaning", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText(
    /Your meaning was created|This exact meaning already exists/u,
  );
  return form;
}

async function downloadBytes(page: Page) {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export own dictionary / original",
      exact: true,
    })
    .click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("a private own meaning and explicit form reach Dictionary, recall and replay without crediting another skill", async ({
  page,
}) => {
  await page.goto("/library/meanings");
  const form = await createMeaning(page, {
    definition: nounDefinition,
    forms: "harbours",
    example: "Our boat waited inside the harbour.",
  });
  const catalog = await readCatalog(page);
  const senseId = catalog.entries[0].senses[0].id;
  expect(catalog.entries[0].provenance.kind).toBe("user-authored");
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBeNull();
  await form
    .getByRole("link", { name: "Open this meaning in Dictionary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "harbour", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/YOUR DEFINITION · UNVERIFIED/u)).toBeVisible();
  await page
    .getByRole("searchbox", {
      name: "Word, form, phrase or translation",
      exact: true,
    })
    .fill("harbours");
  await expect(
    page.getByText(/Selected form: harbours\. Headword: harbour/u),
  ).toBeVisible();
  await page.getByRole("radio").check();
  await page
    .getByRole("button", { name: "Save selected meaning", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Practise this meaning/u }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.learning.v1")!),
  );
  expect(saved.saved.map((item: { senseId: string }) => item.senseId)).toEqual([
    senseId,
  ]);
  expect(saved.evidence).toHaveLength(0);
  await page.goto(
    `/learn/practice?sense=${encodeURIComponent(senseId)}&format=recall`,
  );
  await page
    .getByRole("button", { name: "Start this task", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your answer", exact: true })
    .fill("harbour");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toHaveValue("harbour");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByText("Accepted for this task", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  const rated: TaskLearningState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(rated.tasks).toHaveLength(1);
  expect(rated.tasks[0]).toMatchObject({
    target: { kind: "sense", senseId },
    skill: "recall",
    source: { kind: "user" },
  });
  expect(rated.attempts).toHaveLength(1);
  expect(rated.scheduleEvents).toHaveLength(1);
  expect(rated.reviewItems.every((item) => item.skill === "recall")).toBe(true);
  await page
    .getByRole("button", { name: "Challenge this assessment", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Excluded from active estimates",
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  const challenged: TaskLearningState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(challenged.challenges).toHaveLength(1);
  expect(challenged.scheduleExclusions).toHaveLength(1);
  expect(challenged.scheduleEvents).toEqual(rated.scheduleEvents);
  expect((await readCatalog(page)).entries).toEqual(catalog.entries);
});

test("two own senses and a separate part of speech keep stable identities and require an explicit Dictionary choice", async ({
  page,
}) => {
  await page.goto("/library/meanings");
  await createMeaning(page, { definition: nounDefinition });
  const first = await readCatalog(page);
  await createMeaning(page, {
    definition: secondDefinition,
    appendTo: first.entries[0].lexeme.id,
  });
  await createMeaning(page, {
    definition: verbDefinition,
    partOfSpeech: "verb",
  });
  const catalog = await readCatalog(page);
  expect(catalog.entries).toHaveLength(2);
  expect(catalog.entries[0].senses).toHaveLength(2);
  const ids = catalog.entries.flatMap((entry) =>
    entry.senses.map((sense) => sense.id),
  );
  expect(new Set(ids).size).toBe(3);
  await page.goto("/dictionary?q=harbour");
  const results = page.getByRole("region", {
    name: "Dictionary search results",
    exact: true,
  });
  await expect(results.getByRole("button")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Save selected meaning", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  await results.getByRole("button", { name: /harbour noun/u }).click();
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await radios.nth(0).check();
  await page
    .getByRole("button", { name: "Save selected meaning", exact: true })
    .click();
  await radios.nth(1).check();
  await page
    .getByRole("button", { name: "Save selected meaning", exact: true })
    .click();
  await page.reload();
  const learning = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.learning.v1")!),
  );
  expect(
    learning.saved.map((item: { senseId: string }) => item.senseId),
  ).toEqual(catalog.entries[0].senses.map((sense) => sense.id));
  expect(learning.evidence).toHaveLength(0);
  expect(
    learning.saved.some(
      (item: { senseId: string }) =>
        item.senseId === catalog.entries[1].senses[0].id,
    ),
  ).toBe(false);
  await page.goto("/library");
  await page
    .getByRole("textbox", { name: "Search saved meanings", exact: true })
    .fill("sheltered place");
  await expect(
    page.getByRole("heading", { name: "harbour", exact: true }),
  ).toHaveCount(1);
  expect((await readCatalog(page)).entries).toEqual(catalog.entries);
});

test("an actual own-dictionary export restores repeatedly without remapping IDs and rejects a conflicting meaning", async ({
  page,
}) => {
  await page.goto("/library/meanings");
  await createMeaning(page, { definition: nounDefinition });
  const catalog = await readCatalog(page);
  await page
    .getByText("Own dictionary backup and recovery", { exact: true })
    .click();
  const backup = await downloadBytes(page);
  expect(JSON.parse(backup.toString())).toEqual(catalog);
  const upload = page.getByRole("button", {
    name: "Choose own dictionary backup",
    exact: true,
  });
  for (let index = 0; index < 2; index++) {
    await upload.setInputFiles({
      name: `own-dictionary-${index}.json`,
      mimeType: "application/json",
      buffer: backup,
    });
    await expect(
      page.getByText("0 new entries · 0 new meanings · 1 unchanged entries.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Confirm own dictionary merge",
        exact: true,
      })
      .click();
    expect(await readCatalog(page)).toEqual(catalog);
  }
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    CATALOG_KEY,
  );
  const conflict = structuredClone(catalog);
  conflict.entries[0].senses[0].definition =
    "Conflicting replacement of the original authored meaning.";
  await upload.setInputFiles({
    name: "conflicting-original.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(conflict)),
  });
  await expect(
    page.getByText(
      "Conflicting identities prevent this merge. Existing data is unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm own dictionary merge",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CATALOG_KEY),
  ).toBe(before);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBeNull();
});

test("unreadable own dictionary bytes can be exported and never become an empty writable replacement", async ({
  page,
}) => {
  await page.goto("/");
  const original = "{damaged-own-dictionary";
  await page.evaluate(
    ({ key, original }) => localStorage.setItem(key, original),
    { key: CATALOG_KEY, original },
  );
  await page.goto("/library/meanings");
  const main = page.getByRole("main");
  await expect(main.getByRole("alert").first()).toBeVisible();
  const form = main.getByRole("form", {
    name: "Describe your own meaning",
    exact: true,
  });
  await form
    .getByRole("textbox", { name: "English word or expression", exact: true })
    .fill("harbour");
  await form
    .getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    })
    .fill(nounDefinition);
  await form
    .getByRole("button", { name: "Create user-authored meaning", exact: true })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(
    form.getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    }),
  ).toHaveValue(nounDefinition);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CATALOG_KEY),
  ).toBe(original);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  await main
    .getByText("Own dictionary backup and recovery", { exact: true })
    .click();
  expect((await downloadBytes(page)).toString()).toBe(original);
  await main
    .getByRole("button", { name: "Choose own dictionary backup", exact: true })
    .setInputFiles({
      name: "empty-own-dictionary.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ version: 1, revision: 0, entries: [] }),
      ),
    });
  await expect(
    main.getByText(
      "Recover the current dictionary before merging a backup. Its original bytes are preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CATALOG_KEY),
  ).toBe(original);
});

test("an own-dictionary write failure keeps the user's input and previous stable meanings", async ({
  page,
}) => {
  await page.goto("/library/meanings");
  const form = await createMeaning(page, { definition: nounDefinition });
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    CATALOG_KEY,
  );
  await form
    .getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    })
    .fill(secondDefinition);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key)
        throw new DOMException(
          "Simulated full browser storage",
          "QuotaExceededError",
        );
      original.call(this, name, value);
    };
    window.addEventListener(
      "lexis-test-clear-quota",
      () => {
        Storage.prototype.setItem = original;
      },
      { once: true },
    );
  }, CATALOG_KEY);
  await form
    .getByRole("button", { name: "Create user-authored meaning", exact: true })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(
    form.getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    }),
  ).toHaveValue(secondDefinition);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CATALOG_KEY),
  ).toBe(before);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("lexis-test-clear-quota")),
  );
  await form
    .getByRole("button", { name: "Create user-authored meaning", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText(
    "Your meaning was created on this device.",
  );
  const retried = await readCatalog(page);
  expect(retried.entries).toHaveLength(2);
  expect(retried.entries[0]).toEqual(JSON.parse(before!).entries[0]);
  expect(retried.entries[1].senses[0].definition).toBe(secondDefinition);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBeNull();
  await page.reload();
  expect(await readCatalog(page)).toEqual(retried);
  await expect(
    page.getByRole("region", { name: "User-authored entries", exact: true }),
  ).toContainText(nounDefinition);
});

test("an unresolved import becomes an explicit own meaning and study intention without creating automatic reviews", async ({
  page,
}) => {
  await page.goto("/library/import");
  await page
    .getByRole("button", { name: "Vocabulary list", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose a file", exact: true })
    .setInputFiles({
      name: "original-harbour.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Word,Translation,Context,Source,POS\nharbour,гавань,The boat waited inside the harbour.,Original notes,noun",
      ),
    });
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Import preview", exact: true }),
  ).toContainText("harbour");
  await page
    .getByRole("checkbox", { name: /I am allowed to use this material/u })
    .check();
  await page
    .getByRole("button", { name: "Add to Smart Inbox", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Continue to Smart Inbox", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept intention", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("accepted");
  await expect(
    page.getByText(/Meaning unresolved\. Your context is kept/u),
  ).toBeVisible();
  await page
    .getByText("Describe another meaning yourself", { exact: true })
    .click();
  await createMeaning(page, { definition: nounDefinition });
  const catalog = await readCatalog(page);
  const senseId = catalog.entries[0].senses[0].id;
  await expect(
    page.getByRole("combobox", {
      name: "Meaning for harbour, row 2",
      exact: true,
    }),
  ).toHaveValue(senseId);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Add chosen meaning to study", exact: true })
    .click();
  await expect(
    page.getByText(
      "Selected meaning is saved for study. Your separate practice history is preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  const learning = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.learning.v1")!),
  );
  expect(learning.saved).toHaveLength(1);
  expect(learning.saved[0]).toMatchObject({
    senseId,
    context: "The boat waited inside the harbour.",
  });
  expect(learning.evidence).toHaveLength(0);
  await page.reload();
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("accepted");
  await expect(
    page.getByRole("link", {
      name: "Open selected meaning in Dictionary",
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Roll back import", exact: true })
    .click();
  expect(await readCatalog(page)).toEqual(catalog);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lexis.learning.v1")!),
    ),
  ).toEqual(learning);
});

test("an explicit own sense wins an ambiguous Reader return without being reassigned to the editorial spelling", async ({
  page,
}) => {
  const ownDefinition =
    "To remain in a chosen place a little longer by choice.";
  await page.goto("/library/meanings");
  await createMeaning(page, {
    lemma: "linger",
    partOfSpeech: "verb",
    definition: ownDefinition,
  });
  const catalog = await readCatalog(page);
  const senseId = catalog.entries[0].senses[0].id;
  await page.goto("/reader");
  const token = page
    .getByRole("button", { name: "Look up linger", exact: true })
    .first();
  const tokenId = await token.getAttribute("id");
  expect(tokenId).not.toBeNull();
  const sourceSentence = await token.evaluate((element) =>
    element.closest("[data-reader-sentence]")?.textContent?.trim(),
  );
  expect(sourceSentence).toContain("linger");
  await token.click();
  const quick = page.getByRole("dialog", { name: "Dictionary", exact: true });
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("radio")).toHaveCount(0);
  await quick
    .getByRole("button", { name: "Search Dictionary", exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Dictionary search results",
    exact: true,
  });
  await expect(results.getByRole("button")).toHaveCount(2);
  await results.getByRole("button").filter({ hasText: ownDefinition }).click();
  await expect(page.getByText(/YOUR DEFINITION · UNVERIFIED/u)).toBeVisible();
  const ownSense = page.getByRole("radio");
  await expect(ownSense).toHaveCount(1);
  await expect(ownSense).not.toBeChecked();
  await ownSense.check();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("sense") === senseId,
  );
  await page
    .getByRole("link", { name: "Return to your source", exact: true })
    .click();
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("radio")).toHaveCount(1);
  await expect(quick.getByRole("radio")).toBeChecked();
  await expect(quick.getByRole("radio")).toHaveValue(senseId);
  await expect(quick.locator("blockquote")).toContainText(sourceSentence!);
  await expect(
    quick.getByText(/Your own note · not independently verified/u),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe(`#${tokenId}`);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBeNull();
  await page.reload();
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("radio")).toBeChecked();
  await expect(quick.getByRole("radio")).toHaveValue(senseId);
  await expect(quick.locator("blockquote")).toContainText(sourceSentence!);
  await page.keyboard.press("Escape");
  await expect(page.locator(`#${tokenId}`)).toBeFocused();
  await expect(page.locator(`#${tokenId}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(`#${tokenId}`)).toBeInViewport();
  expect((await readCatalog(page)).entries).toEqual(catalog.entries);
});
