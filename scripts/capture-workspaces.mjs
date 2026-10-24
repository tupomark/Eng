/**
 * Reproducible captures from an already running production build.
 * Run after browser tests, never concurrently with a rebuild:
 *   node scripts/capture-workspaces.mjs
 * Uses fresh isolated browser contexts and original repository fixtures only.
 * Does not make AI calls, request microphone permission, or publish any data.
 */
import { chromium, webkit, devices, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".cache/ms-playwright");
const origin = "http://127.0.0.1:3000";
const destination = resolve("docs/screenshots/2026-10-24-v2");
const sourceAnchor = "a3db700";
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const hasUncommittedChanges = Boolean(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
);
const manifest = {
  generatedAt: new Date().toISOString(),
  sourceHead,
  builtSourceHead: process.env.LEXIS_CAPTURE_BUILD_SHA ?? sourceHead,
  sourceAnchor,
  hasUncommittedChanges,
  origin,
  content:
    "Fresh isolated local profiles; original fixtures and real UI actions. Not production learner data or a mastery claim.",
  limitations: [
    "Screenshots do not establish full accessibility, WCAG certification or final owner visual approval.",
    "iPhone 13 WebKit emulation is not physical iPhone Safari/standalone verification.",
    "No live AI, hosted Auth/sync, ASR/TTS/live transport or pronunciation provider is verified here.",
    "Long-content, 200% zoom, screen reader, heat/memory and audio interruption checks require separate evidence.",
  ],
  browsers: [],
};
await mkdir(destination, { recursive: true });

const engineConfigurations = [
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
for (const configuration of engineConfigurations) {
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
    page.on("pageerror", (error) => {
      // No raw message/DOM/query/answer is copied into diagnostics.
      entry.pageErrors.push({ step, category: error.name });
    });
    const open = async (path) => {
      step = path.split("?")[0];
      await page.goto(origin + path, { waitUntil: "load" });
      await expect(page.locator("main").first()).toBeVisible();
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
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      entry.captures.push({ filename, detail, horizontalOverflow: overflow });
      console.log(`${configuration.name}: ${name}`);
    };

    // First-use/empty states remain visible before any practice action.
    for (const [path, name] of [
      ["/", "home-first-use"],
      ["/library", "library-empty"],
      ["/library/import", "import-start"],
      ["/library/inbox", "inbox-empty"],
      ["/learn", "learn-empty"],
      ["/core/observatory", "observatory-empty"],
      ["/settings", "settings"],
    ]) {
      await open(path);
      await capture(name, "First-use local state; no invented progress.");
    }

    await open("/reader");
    await capture("reader-sample", "Original three-part sample Reader.");
    await page
      .getByRole("button", { name: "Look up linger", exact: true })
      .first()
      .click();
    const quick = page.getByRole("dialog", { name: "Dictionary", exact: true });
    await expect(quick).toBeVisible();
    await capture(
      "dictionary-quick",
      "Real Quick View over the original reading context.",
    );
    await quick.getByRole("radio").first().check();
    await quick
      .getByRole("button", { name: "Open full entry", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "linger", exact: true }),
    ).toBeVisible();
    await capture(
      "dictionary-full",
      "Explicitly selected editorial sense, bounded source context.",
    );
    await page.getByRole("button", { name: "Deep Dive", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Meaning in use", exact: true }),
    ).toBeVisible();
    await capture(
      "dictionary-deep",
      "Authored usage/contrast, not generated licensed content.",
    );
    await open("/dictionary?q=unlisted-phrase");
    await expect(
      page.getByRole("heading", { name: "Outside this sample.", exact: true }),
    ).toBeVisible();
    await capture(
      "dictionary-unavailable",
      "Honest unavailable lookup outside eight authored entries.",
    );

    // Import through the UI; only the original repository fixture is used.
    await open("/library/import");
    await page
      .getByRole("button", { name: "Choose a file", exact: true })
      .setInputFiles(resolve("tests/fixtures/materials/original-reading.txt"));
    await page
      .getByLabel("Title / source name")
      .fill("A quiet coast · original capture fixture");
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Import preview" }),
    ).toBeVisible();
    await capture(
      "import-preview",
      "Preview before private local storage; no upload.",
    );
    await page
      .getByRole("checkbox", { name: /I am allowed to use this material/u })
      .check();
    await page
      .getByRole("button", { name: "Save document", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Continue reading", exact: true })
      .click();
    await expect(
      page.getByRole("article", { name: "Document text" }),
    ).toContainText("We linger by the sea.");
    const readerPath = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Bookmark", exact: true }).click();
    await capture(
      "reader-own-text",
      "Original TXT stored by a real import action, with saved bookmark.",
    );
    await open("/library");
    await capture(
      "library-material",
      "Real local document; no fabricated learning count.",
    );
    await open("/");
    await capture(
      "home-resume",
      "Home resumes the original local imported document.",
    );

    await open("/library/import");
    await page
      .getByRole("button", { name: "Vocabulary list", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose a file", exact: true })
      .setInputFiles(
        resolve("tests/fixtures/materials/original-vocabulary.xlsx"),
      );
    await page
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Import preview" }),
    ).toContainText("linger");
    await page
      .getByRole("checkbox", { name: /I am allowed to use this material/u })
      .check();
    await page
      .getByRole("button", { name: "Add to Smart Inbox", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Continue to Smart Inbox", exact: true })
      .click();
    await capture(
      "inbox-imported",
      "Original XLSX rows awaiting decisions; import creates no knowledge or bulk due.",
    );

    // One actual closed recall task, no seeded scores or hidden progress records.
    await open("/learn/practice?sense=linger-stay&format=recall");
    await page
      .getByRole("button", { name: "Save meaning and start", exact: true })
      .click();
    await page.getByLabel("Your answer").fill("linger");
    await capture(
      "practice-answer",
      "Actual answer draft in a closed recall task.",
    );
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      page.getByText("Accepted for this task", { exact: true }),
    ).toBeVisible();
    await capture(
      "practice-feedback",
      "Deterministic closed-task result from the real submitted answer.",
    );
    await page.getByRole("button", { name: "Good", exact: true }).click();
    await capture(
      "practice-fsrs",
      "Explicit user rating, real library-backed FSRS; no mastery claim.",
    );
    for (const [path, name] of [
      ["/learn", "learn"],
      ["/core", "core"],
      ["/core/observatory", "observatory"],
      ["/core/network?sense=linger-stay", "network"],
    ]) {
      await open(path);
      await capture(
        name,
        "Fresh local profile after one actual submitted task; source facts remain inspectable.",
      );
    }

    await open("/writing");
    await page
      .getByRole("button", { name: "Create your first draft", exact: true })
      .click();
    const draftDialog = page.getByRole("dialog", {
      name: "A new piece of writing",
    });
    await draftDialog
      .getByLabel("Title", { exact: true })
      .fill("An evening by the coast");
    await draftDialog
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
    await expect(draftDialog).not.toBeVisible();
    await page
      .getByRole("textbox", { name: "Your English text", exact: true })
      .fill(
        "We linger by the sea after the last bus has gone. Each window has a story, and I want to describe what I notice in my own words. This original paragraph is written through the editor for visual review; it has not been graded by AI.",
      );
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved on this device$/u }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Your English text", exact: true })
      .click();
    await capture(
      "writing-draft",
      "Actual editor input/autosave at its focused scroll position, no invented writing proficiency or AI correction.",
      false,
    );
    await open("/grammar");
    await capture("grammar", "Authored concept/rule and common task practice.");

    await open("/goals");
    await page.getByLabel("Goal title").fill("Read a little every day");
    await page
      .getByLabel("Your subject or context")
      .fill("Stories, travel and everyday life");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Read a little every day",
        exact: true,
      }),
    ).toBeVisible();
    await capture(
      "goals",
      "Declared optional goal saved by real action; defined count, no artificial percentage.",
    );

    await open("/tutor/chat");
    await page
      .getByRole("textbox", { name: "Your question", exact: true })
      .fill("How are the two meanings of linger different?");
    await capture(
      "tutor-chat",
      "Local question draft and unavailable capability; no external AI request or canned reply.",
    );
    await open("/tutor");
    await capture(
      "voice-idle",
      "Explicit visual prototype; no microphone capture.",
    );
    for (const state of [
      "listening",
      "processing",
      "speaking",
      "paused",
      "error",
    ]) {
      await page
        .getByLabel("Preview voice state", { exact: true })
        .selectOption(state);
      await capture(
        `voice-${state}`,
        "Explicit simulated visual state; no actual recording/speech/provider.",
      );
    }

    await open("/listening");
    await expect(
      page.getByRole("heading", { name: "A quiet coast", exact: true }),
    ).toBeVisible();
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      return !!audio && Number.isFinite(audio.duration) && audio.duration > 3;
    });
    await page
      .getByRole("button", { name: "Play recording", exact: true })
      .click();
    await page.waitForFunction(
      () => (document.querySelector("audio")?.currentTime ?? 0) > 0.4,
    );
    await page
      .getByRole("button", { name: "Pause recording", exact: true })
      .click();
    await capture(
      "listening-hidden",
      "Original synthetic audio really played, transcript hidden; no microphone request.",
    );
    await page
      .getByRole("button", { name: "Reveal first part", exact: true })
      .click();
    await capture(
      "listening-assisted",
      "Explicit transcript disclosure; no independent listening grade fabricated.",
    );

    await open("/offline");
    await capture(
      "offline-before-setup",
      "Public workspace before opt-in; not a claim of offline delivery yet.",
    );
    await page
      .getByRole("button", { name: "Enable offline workspace", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Offline workspace prepared" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await open("/offline");
    await capture(
      "offline-network-disabled",
      "Real context network disabled; public cached shell, private document stays in browser storage.",
    );
    await open(readerPath);
    await expect(
      page.getByRole("article", { name: "Document text" }),
    ).toContainText("We linger by the sea.");
    await capture(
      "reader-network-disabled",
      "Actual original imported text reopened with network disabled.",
    );
    await context.setOffline(false);
    entry.result = entry.pageErrors.length
      ? "captured-with-page-errors"
      : "captured";
    failed ||= entry.pageErrors.length > 0;
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
