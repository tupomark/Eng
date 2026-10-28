import { expect, test } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../../src/domain/preferences/preferences";

test("recall draft resumes and only its skill gets evidence; rating and challenge replay separately", async ({
  page,
}) => {
  await page.goto("/learn/practice?sense=linger-stay&format=recall");
  await page
    .getByRole("button", { name: "Save meaning and start", exact: true })
    .click();
  await page.getByLabel("Your answer").fill("linger");
  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue("linger");
  await page.getByRole("button", { name: "Show first-letter hint" }).click();
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByText("Accepted for this task", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Assisted recall observation. It does not update any other skill.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Good", exact: true }),
  ).toBeDisabled();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(stored.attempts).toHaveLength(1);
  expect(stored.scheduleEvents).toHaveLength(1);
  expect(stored.tasks[0].skill).toBe("recall");
  expect(stored.attempts[0].assistance.hintIds).toEqual(["first-letter"]);
  await page
    .getByRole("button", { name: "Challenge this assessment", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Excluded from active estimates",
      exact: true,
    }),
  ).toBeDisabled();
  const challenged = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(challenged.challenges).toHaveLength(1);
  expect(challenged.scheduleExclusions).toHaveLength(1);
  expect(challenged.scheduleEvents).toEqual(stored.scheduleEvents);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Excluded from active estimates",
      exact: true,
    }),
  ).toBeDisabled();
});

test("open writing answer is preserved ungraded and produces no lapse or competence observation", async ({
  page,
}) => {
  await page.goto("/learn/practice?sense=linger-stay&format=own-sentence");
  await page
    .getByRole("button", { name: "Save meaning and start", exact: true })
    .click();
  await page
    .getByLabel("Your answer")
    .fill("We linger by the river after lunch.");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByText("Saved without an assessment", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(stored.attempts[0].answer).toBe("We linger by the river after lunch.");
  expect(stored.attempts[0].evaluation.outcome).toBe("uncertain");
  expect(stored.scheduleEvents).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Good", exact: true }),
  ).toHaveCount(0);
});

test("explicit legacy bootstrap preserves v1 bytes and a later Core dispute excludes its FSRS event", async ({
  page,
}) => {
  const source = {
    version: 1,
    readerProgress: 42,
    saved: [
      {
        senseId: "linger-stay",
        context: "We linger by the sea.",
        savedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "original-not-uuid",
        senseId: "linger-stay",
        skill: "recognition",
        source: "self-review",
        rating: "good",
        occurredAt: "2026-10-21T00:00:00.000Z",
      },
    ],
  };
  await page.goto("/");
  await page.evaluate(
    (data) => localStorage.setItem("lexis.learning.v1", JSON.stringify(data)),
    source,
  );
  await page.goto("/learn/practice");
  await page
    .getByText("Move recognition history to FSRS", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview recognition migration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm FSRS bootstrap", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBe(JSON.stringify(source));
  await page.goto("/core");
  await page
    .getByRole("button", { name: "Dispute this rating", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("lexis.tasks.v1")!)
            .scheduleExclusions,
      ),
    )
    .toMatchObject([{ eventId: "legacy:original-not-uuid" }]);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.tasks.v1")!).legacyBackups[0]
          .state,
    ),
  ).toEqual(source);
});

test("migrated recognition resumes with its context and a due self-check cannot be rated twice or replayed after reload", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-24T12:00:00.000Z") });
  const source = {
    version: 1,
    readerProgress: 42,
    saved: [
      {
        senseId: "linger-stay",
        context: "Our own saved context: we linger by the harbour.",
        savedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "legacy-retained-self-report",
        senseId: "linger-stay",
        skill: "recognition",
        source: "self-review",
        rating: "again",
        occurredAt: "2026-10-21T00:00:00.000Z",
      },
    ],
  };
  await page.goto("/");
  await page.evaluate(
    (data) => localStorage.setItem("lexis.learning.v1", JSON.stringify(data)),
    source,
  );
  await page.goto("/learn/practice");
  await page
    .getByText("Move recognition history to FSRS", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview recognition migration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm FSRS bootstrap", exact: true })
    .click();

  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "Your practice is ready.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "You are up to date.", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Open FSRS practice", exact: true })
    .last()
    .click();

  const selfCheck = page.getByRole("region", {
    name: "FSRS self-check for linger",
    exact: true,
  });
  await expect(
    selfCheck.getByText(source.saved[0].context, { exact: true }),
  ).toBeVisible();
  await selfCheck
    .getByRole("button", { name: "Reveal saved meaning", exact: true })
    .click();
  await selfCheck
    .getByRole("button", { name: "Good", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByText(
      "Recognition schedule updated. Your original self-report history stays intact.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/Next recognition self-check:/)).toBeVisible();
  const due = await page.locator("time[datetime]").getAttribute("datetime");
  expect(due).not.toBeNull();
  await page.clock.fastForward(
    Date.parse(due!) - Date.parse("2026-10-24T12:00:00.000Z") + 1_000,
  );
  await expect(
    selfCheck.getByRole("button", {
      name: "Reveal saved meaning",
      exact: true,
    }),
  ).toBeVisible();
  await selfCheck
    .getByRole("button", { name: "Reveal saved meaning", exact: true })
    .click();
  await selfCheck.getByRole("button", { name: "Good", exact: true }).click();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lexis.tasks.v1")!),
  );
  expect(after.scheduleEvents).toHaveLength(3);
  expect(
    after.scheduleEvents.filter(
      (event: { source: string }) => event.source === "user-rating",
    ),
  ).toHaveLength(2);
  expect(after.attempts).toHaveLength(0);
  expect(after.tasks).toHaveLength(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.learning.v1")),
  ).toBe(JSON.stringify(source));

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reveal saved meaning", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Next recognition self-check:/)).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("lexis.tasks.v1")!).scheduleEvents,
    ),
  ).toEqual(after.scheduleEvents);
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "You are up to date.", exact: true }),
  ).toBeVisible();
});

test("bounded session modes retain completed work and Free Exploration keeps manual access", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    (preferences) =>
      localStorage.setItem("lexis.preferences.v1", JSON.stringify(preferences)),
    { ...DEFAULT_PREFERENCES, dailyItems: 1 },
  );
  await page.goto("/learn/practice?sense=linger-stay&format=recall");
  await page
    .getByRole("button", { name: "Save meaning and start", exact: true })
    .click();
  await page.getByLabel("Your answer").fill("linger");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByText(/A good place to pause/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start another attempt", exact: true }),
  ).toBeDisabled();
  const before = await page.evaluate(() =>
    localStorage.getItem("lexis.tasks.v1"),
  );
  await page
    .getByRole("combobox", { name: "Session mode", exact: true })
    .selectOption("focused");
  await expect(page.getByText(/1 completed in this session/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start another attempt", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Session mode", exact: true })
    .selectOption("goal");
  await expect(
    page.getByText(/Goal-driven task selection is not configured yet/),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Session mode", exact: true })
    .selectOption("free");
  await expect(
    page.getByRole("button", { name: "Start another attempt", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Choose next saved meaning",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBe(before);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Session mode", exact: true }),
  ).toHaveValue("free");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.practice-session.v1")!)
          .attemptIds,
    ),
  ).toHaveLength(1);
  await page
    .getByRole("combobox", { name: "Session mode", exact: true })
    .selectOption("quick");
  await expect(page.getByText(/1 completed in this session/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start another attempt", exact: true }),
  ).toBeDisabled();
});
