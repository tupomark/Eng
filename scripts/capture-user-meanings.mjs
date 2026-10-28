/**
 * Capture the real user-authored meaning journey from a running production build.
 * Run only after browser gates, never concurrently with a rebuild:
 *   LEXIS_CAPTURE_BUILD_SHA=<compiled-source-sha> node scripts/capture-user-meanings.mjs
 * Fresh browser profiles; original harbour notes; no AI calls, mic access or upload.
 */
import { chromium, webkit, devices, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".cache/ms-playwright");
const builtSourceHead = process.env.LEXIS_CAPTURE_BUILD_SHA;
if (!builtSourceHead || !/^[a-f0-9]{40}$/u.test(builtSourceHead))
  throw new Error(
    "Provide the exact compiled source SHA in LEXIS_CAPTURE_BUILD_SHA.",
  );

const origin = "http://127.0.0.1:3000";
const destination = resolve("docs/screenshots/2026-10-25-user-meanings");
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const manifest = {
  generatedAt: new Date().toISOString(),
  sourceHead,
  builtSourceHead,
  hasUncommittedChanges: Boolean(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ),
  origin,
  content:
    "Fresh isolated local profiles. Original harbour notes authored through the UI, then one real recall submission and user rating. No owner materials, hidden scores or external providers.",
  limitations: [
    "User-authored definitions are not independently verified dictionary facts. A successful recall matches the learner's own answer key only.",
    "WebKit iPhone 13 emulation is not physical iPhone Safari or standalone verification.",
    "Captures do not establish full accessibility, 200% zoom, screen reader, composited contrast, performance or final owner visual approval.",
    "Local browser persistence is not hosted Auth, cloud backup, two-device sync or a live AI/dictionary integration.",
  ],
  browsers: [],
};
await mkdir(destination, { recursive: true });

const configurations = [
  {
    name: "desktop-chromium",
    type: chromium,
    launch: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : existsSync("/usr/bin/chromium")
        ? { executablePath: "/usr/bin/chromium" }
        : {},
    context: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 1050 },
      reducedMotion: "reduce",
    },
  },
  {
    name: "iphone-webkit",
    type: webkit,
    launch: {},
    context: { ...devices["iPhone 13"], reducedMotion: "reduce" },
  },
];

let failed = false;
for (const configuration of configurations) {
  const entry = {
    name: configuration.name,
    viewport: configuration.context.viewport,
    deviceScaleFactor: configuration.context.deviceScaleFactor,
    reducedMotion: "reduce",
    captures: [],
    pageErrors: [],
    result: "running",
  };
  manifest.browsers.push(entry);
  let browser;
  let step = "launch";
  try {
    browser = await configuration.type.launch(configuration.launch);
    entry.browserVersion = browser.version();
    const context = await browser.newContext(configuration.context);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    page.on("pageerror", (error) =>
      entry.pageErrors.push({ step, category: error.name }),
    );
    const main = () => page.getByRole("main");
    const open = async (path) => {
      step = path.split("?")[0];
      await page.goto(origin + path, { waitUntil: "load" });
      await expect(main()).toBeVisible();
    };
    const capture = async (name, detail, resetScroll = true) => {
      step = name;
      await page.evaluate(async (reset) => {
        await document.fonts.ready;
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
        if (reset) window.scrollTo(0, 0);
      }, resetScroll);
      const filename = `${configuration.name}-${name}.png`;
      await page.screenshot({
        path: resolve(destination, filename),
        fullPage: false,
      });
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      entry.captures.push({ filename, detail, horizontalOverflow });
      failed ||= horizontalOverflow;
      console.log(`${configuration.name}: ${name}`);
    };

    await open("/library/meanings?q=harbour");
    const form = main().getByRole("form", {
      name: "Describe your own meaning",
      exact: true,
    });
    await expect(
      form.getByRole("textbox", {
        name: "English word or expression",
        exact: true,
      }),
    ).toHaveValue("harbour");
    await form
      .getByRole("combobox", { name: "Part of speech", exact: true })
      .selectOption("noun");
    const definition = form.getByRole("textbox", {
      name: "Your English definition of this meaning",
      exact: true,
    });
    await definition.fill("A sheltered place where boats can stop.");
    await definition.click();
    await capture(
      "own-meaning-draft",
      "Actual definition input at the current editor focus; no study intention or knowledge event exists.",
      false,
    );

    await form
      .getByText("Translation, example and optional details", { exact: true })
      .click();
    await form
      .getByRole("textbox", {
        name: "Translation or explanation in Russian (optional)",
        exact: true,
      })
      .fill("гавань");
    await form
      .getByRole("textbox", {
        name: "Your example in English (optional)",
        exact: true,
      })
      .fill("Our boat waited inside the harbour.");
    await form
      .getByRole("textbox", {
        name: "Explicit word forms (optional, separated by commas)",
        exact: true,
      })
      .fill("harbours");
    await form
      .getByRole("button", {
        name: "Create user-authored meaning",
        exact: true,
      })
      .click();
    await expect(form.getByRole("status")).toContainText(
      "Your meaning was created on this device.",
    );
    await form.getByRole("status").scrollIntoViewIfNeeded();
    await capture(
      "own-meaning-created",
      "Metadata created by a real form submission; no review or evidence is created by authoring.",
      false,
    );
    const senseId = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lexis.lexical-catalog.v1")).entries[0]
          .senses[0].id,
    );
    await form
      .getByRole("link", {
        name: "Open this meaning in Dictionary",
        exact: true,
      })
      .click();
    await expect(
      main().getByRole("heading", { name: "harbour", exact: true }),
    ).toBeVisible();
    await expect(
      main().getByText(/YOUR DEFINITION · UNVERIFIED/u),
    ).toBeVisible();
    await capture(
      "dictionary-own-meaning",
      "The exact private user-authored sense appears with explicit unverified provenance; no editorial authority or audio is implied.",
    );
    await main().getByRole("radio").check();
    await main()
      .getByRole("button", { name: "Save selected meaning", exact: true })
      .click();
    await expect(
      main().getByRole("link", { name: /Practise this meaning/u }),
    ).toBeVisible();

    await open(
      `/learn/practice?sense=${encodeURIComponent(senseId)}&format=recall`,
    );
    await main()
      .getByRole("button", { name: "Start this task", exact: true })
      .click();
    await main()
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill("harbour");
    await main()
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      main().getByText("Accepted for this task", { exact: true }),
    ).toBeVisible();
    await main()
      .getByText("Accepted for this task", { exact: true })
      .scrollIntoViewIfNeeded();
    await capture(
      "recall-own-answer-key",
      "One actual independent recall response, matched against the user's own key. This does not verify the definition or another skill.",
      false,
    );
    await main().getByRole("button", { name: "Good", exact: true }).click();
    await expect(
      main().getByRole("region", { name: "FSRS schedule", exact: true }),
    ).toBeVisible();

    await open("/library");
    await main()
      .getByRole("textbox", { name: "Search saved meanings", exact: true })
      .fill("sheltered place");
    await expect(
      main().getByRole("heading", { name: "harbour", exact: true }),
    ).toBeVisible();
    await main()
      .getByRole("heading", { name: "harbour", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(
      "library-saved-own-meaning",
      "The saved sense remains searchable with its user provenance after a real recall/rating; source and evidence have separate identities.",
      false,
    );

    await open("/core/observatory");
    await expect(
      main().getByRole("heading", {
        name: "What was actually observed",
        exact: true,
      }),
    ).toBeVisible();
    await main()
      .getByRole("heading", { name: "What was actually observed", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(
      "observatory-own-recall",
      "A single real recall observation feeds the common Observatory; no fabricated proficiency percentage, listening, writing or speaking success.",
      false,
    );
    entry.facts = await page.evaluate(() => {
      const catalog = JSON.parse(
        localStorage.getItem("lexis.lexical-catalog.v1"),
      );
      const learning = JSON.parse(localStorage.getItem("lexis.learning.v1"));
      const tasks = JSON.parse(localStorage.getItem("lexis.tasks.v1"));
      return {
        userAuthoredEntries: catalog.entries.length,
        savedMeanings: learning.saved.length,
        legacyEvidence: learning.evidence.length,
        evaluatedAttempts: tasks.attempts.filter(
          (attempt) => attempt.status === "evaluated",
        ).length,
        taskSkills: [...new Set(tasks.tasks.map((task) => task.skill))],
        taskSourceKinds: [
          ...new Set(tasks.tasks.map((task) => task.source.kind)),
        ],
        scheduleEvents: tasks.scheduleEvents.length,
      };
    });
    entry.result = entry.pageErrors.length
      ? "captured-with-page-errors"
      : entry.captures.some((capture) => capture.horizontalOverflow)
        ? "captured-with-overflow"
        : "captured";
    failed ||= entry.result !== "captured";
    await context.close();
  } catch (error) {
    failed = true;
    entry.result = "failed";
    entry.failure = {
      step,
      category: error instanceof Error ? error.name : "unknown",
    };
    console.error(
      `${configuration.name}: capture failed at ${step}; category ${entry.failure.category}`,
    );
  } finally {
    await browser?.close();
    await writeFile(
      resolve(destination, "capture-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  }
}
if (failed) process.exitCode = 1;
