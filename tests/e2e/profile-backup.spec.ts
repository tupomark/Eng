import {
  devices,
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TaskSession } from "../../src/application/task-session";
import { emptyTaskLearningState } from "../../src/domain/tasks/state";
import type { TaskDefinition } from "../../src/domain/tasks/types";
import {
  disputeEvidence,
  emptyState,
  reviewSense,
  saveSense,
} from "../../src/domain/learning";
import {
  addUserLexicalEntry,
  createUserLexicalEntry,
  emptyUserLexicalCatalog,
} from "../../src/domain/lexical-catalog";
import {
  createWritingDraft,
  emptyWritingWorkspace,
  saveWritingRevision,
} from "../../src/domain/writing/workspace";
import { DEFAULT_PREFERENCES } from "../../src/domain/preferences/preferences";
import { DEFAULT_READER_PREFERENCES } from "../../src/domain/reader-preferences";
import { emptyTutorWorkspace } from "../../src/domain/ai/conversation";
import {
  openProfileBackupContainer,
  parseProfileJsonBody,
} from "../../src/infrastructure/profile/container";

const at = "2026-10-20T08:00:00.000Z";
const later = "2026-10-21T08:00:00.000Z";
const challengeAt = "2026-10-22T08:00:00.000Z";
const senseId = "user-sense-profile-original";
const mediaId = "media-profile-original";
const ignoredToken = "DO-NOT-EXPORT-generated-test-token";
const localKeys = [
  "lexis.learning.v1",
  "lexis.tasks.v1",
  "lexis.materials.v1",
  "lexis.lexical-catalog.v1",
  "lexis.sense-contexts.v1",
  "lexis.goals.v1",
  "lexis.preferences.v1",
  "lexis.reader.preferences.v1",
  "lexis.practice-session.v1",
  "lexis.tutor.v1:local",
] as const;

interface ProfileCapture {
  state(name: string, detail: string, target?: Locator): Promise<void>;
  finish(successful: boolean): Promise<void>;
}

/**
 * Optional visual evidence from these same real browser journeys and original fixtures.
 * Run against an already built application, never during a rebuild:
 * LEXIS_CAPTURE_PROFILE=docs/screenshots/<dated-directory>
 * LEXIS_CAPTURE_SOURCE_SHA=<checkout-sha> LEXIS_CAPTURE_BUILD_SHA=<compiled-sha>
 * npm run test:e2e -- tests/e2e/profile-backup.spec.ts
 * Each scenario/project writes its own manifest so parallel workers cannot overwrite rows.
 */
async function profileCapture(
  page: Page,
  info: TestInfo,
  scenario: string,
): Promise<ProfileCapture | null> {
  const output = process.env.LEXIS_CAPTURE_PROFILE;
  if (!output) return null;
  const sourceSHA = process.env.LEXIS_CAPTURE_SOURCE_SHA;
  const builtSourceSHA = process.env.LEXIS_CAPTURE_BUILD_SHA;
  if (
    !sourceSHA ||
    !/^[a-f0-9]{40}$/u.test(sourceSHA) ||
    !builtSourceSHA ||
    !/^[a-f0-9]{40}$/u.test(builtSourceSHA)
  )
    throw new Error(
      "Profile captures require exact LEXIS_CAPTURE_SOURCE_SHA and LEXIS_CAPTURE_BUILD_SHA values.",
    );
  const destination = resolve(output);
  await mkdir(destination, { recursive: true });
  const checkoutHead = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const hasUncommittedChanges = Boolean(
    execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim(),
  );
  const productionBuildId = (
    await readFile(resolve(".next/BUILD_ID"), "utf8")
  ).trim();
  const pageErrors: { state: string; category: string }[] = [];
  const captures: {
    name: string;
    filename: string;
    detail: string;
    capturedAt: string;
    path: string;
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    scrollY: number;
    documentWidth: number;
    horizontalOverflowPx: number;
    reducedMotion: boolean;
  }[] = [];
  let currentState = "opening";
  page.on("pageerror", (error) => {
    // No private input, query strings, DOM or raw exception message in diagnostics.
    pageErrors.push({ state: currentState, category: error.name });
  });
  const manifest = {
    result: "capturing" as "capturing" | "captured" | "failed",
    generatedAt: new Date().toISOString(),
    sourceSHA,
    builtSourceSHA,
    checkoutHead,
    hasUncommittedChanges,
    productionBuildId,
    project: info.project.name,
    scenario,
    test: info.title,
    browserEngine: page.context().browser()?.browserType().name() ?? "unknown",
    browserVersion: page.context().browser()?.version() ?? "unknown",
    screenshots:
      "Actual viewport captures; CSS animations disabled for a stable still image.",
    content:
      "Fresh isolated browser profiles. Original repository learning, writing and media fixtures; real export/preview/restore UI. The quota-error state is deliberately induced, not a provider outage or production incident.",
    limitations: [
      "Local portable backup is not hosted account persistence, cloud backup or automatic two-device synchronization.",
      "WebKit iPhone 13 emulation is not physical iPhone Safari or standalone PWA verification.",
      "Captures do not prove full accessibility, screen reader/zoom/contrast/performance compliance or final owner visual approval.",
      "No live AI, dictionary, speech, hosted Auth or external upload is used by these capture journeys.",
    ],
    captures,
    pageErrors,
  };
  const manifestPath = resolve(
    destination,
    `${info.project.name}-${scenario}-manifest.json`,
  );
  const flush = () =>
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await flush();
  return {
    async state(name, detail, target) {
      currentState = name;
      await expect(page.getByTestId("profile-export-learning")).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        );
      });
      if (target) {
        await target.evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
        await page.evaluate(() => window.scrollBy(0, -80));
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      const filename = `${info.project.name}-${name}.png`;
      await page.screenshot({
        path: resolve(destination, filename),
        fullPage: false,
        animations: "disabled",
      });
      const metrics = await page.evaluate(() => ({
        path: window.location.pathname,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        deviceScaleFactor: window.devicePixelRatio,
        scrollY: window.scrollY,
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflowPx: Math.max(
          0,
          document.documentElement.scrollWidth - window.innerWidth,
        ),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
      }));
      captures.push({
        name,
        filename,
        detail,
        capturedAt: new Date().toISOString(),
        ...metrics,
      });
      await flush();
    },
    async finish(successful) {
      manifest.result =
        successful &&
        captures.length > 0 &&
        pageErrors.length === 0 &&
        captures.every((capture) => capture.horizontalOverflowPx === 0)
          ? "captured"
          : "failed";
      await flush();
      if (successful && manifest.result !== "captured")
        throw new Error(
          "Profile visual capture contains runtime errors, horizontal overflow or no completed screenshots. Inspect the saved manifest.",
        );
    },
  };
}

function profileFixture() {
  const entry = createUserLexicalEntry({
    lexemeId: "user-lexeme-profile-original",
    senseId,
    lemma: "harbour",
    partOfSpeech: "noun",
    definition: "A sheltered place where boats can stop.",
    translation: "гавань",
    example: "We found a quiet harbour before the storm.",
    forms: ["harbours"],
    at,
  });
  const catalog = addUserLexicalEntry(emptyUserLexicalCatalog(), entry);
  const context = "We found a quiet harbour before the storm. Свой текст 🌒.";
  let learning = saveSense(emptyState(), senseId, context, at);
  learning = reviewSense(
    learning,
    senseId,
    "good",
    later,
    "legacy-original-id",
  );
  learning = disputeEvidence(learning, "legacy-original-id", challengeAt);
  let tasks = emptyTaskLearningState();
  let serialized: string | null = null;
  let nextId = 0;
  let clock = later;
  const taskSession = new TaskSession(
    {
      read: () => ({ state: tasks, serialized }),
      commit: (next) => {
        tasks = next;
        serialized = JSON.stringify(next);
        return serialized;
      },
    },
    { now: () => clock, createId: () => `profile-attempt-${++nextId}` },
  );
  taskSession.load();
  const task: TaskDefinition = {
    id: "profile-recall-original",
    version: "1",
    target: { kind: "sense", senseId },
    skill: "recall",
    format: "recall",
    promptFamily: "word-recall",
    prompt: entry.senses[0].definition,
    acceptedAnswers: ["harbour", "harbor"],
    explanation: "Both regional forms are accepted in this original fixture.",
    rubricVersion: "profile-fixture-key-1",
    evaluator: "deterministic",
    hints: [],
    source: {
      provider: "LEXIS original test author",
      version: "1",
      rights: "Original test fixture",
      kind: "editorial",
    },
  };
  const attempt = taskSession.startTask(task);
  taskSession.submitTask(attempt.id, "harbor");
  taskSession.recordRating(tasks.reviewItems[0].id, "good", attempt.id);
  clock = challengeAt;
  taskSession.challenge(
    `observation:${attempt.id}`,
    "Review this task wording.",
  );

  let writing = createWritingDraft(emptyWritingWorkspace(), {
    id: "profile-draft-original",
    revisionId: "profile-revision-root",
    title: "My original note",
    kind: "free",
    now: at,
  });
  writing = saveWritingRevision(writing, {
    draftId: "profile-draft-original",
    baseId: "profile-revision-root",
    revisionId: "profile-revision-a",
    text: "My first independent version. Своя мысль 📝.",
    now: later,
  });
  writing = saveWritingRevision(writing, {
    draftId: "profile-draft-original",
    baseId: "profile-revision-root",
    revisionId: "profile-revision-b",
    text: "A competing independent version which must survive.",
    now: challengeAt,
  });
  const tutor = emptyTutorWorkspace("local", "profile-tutor-original");
  tutor.sessions[0].messages = [
    {
      id: "profile-tutor-message",
      requestId: "profile-tutor-request",
      role: "user",
      text: "Please explain only my selected excerpt.",
      occurredAt: at,
      status: "pending",
      sourceIds: ["profile-document-original"],
    },
  ];
  tutor.sessions[0].pendingRequest = {
    requestId: "profile-tutor-request",
    sessionId: tutor.sessions[0].id,
    style: "mentor",
    sessionType: "guided-lesson",
    message: tutor.sessions[0].messages[0].text,
    history: [],
    context: {
      id: "profile-tutor-context",
      excerpt: context,
      sourceIds: ["profile-document-original"],
    },
    consent: true,
  };
  const anchor = {
    documentVersion: "profile-document-version",
    chapterId: "profile-chapter-original",
    paragraphIndex: 0,
    characterOffset: 16,
  };
  const values: Record<string, unknown> = {
    "lexis.learning.v1": learning,
    "lexis.tasks.v1": tasks,
    "lexis.materials.v1": {
      version: 1,
      owner: "local",
      revision: 1,
      batches: [],
      documents: [
        {
          id: "profile-document-original",
          version: "profile-document-version",
          title: "My coast notes",
          sourceName: "my-coast.txt",
          format: "txt",
          createdAt: at,
          updatedAt: at,
          rights: "user-provided",
          chapters: [
            {
              id: "profile-chapter-original",
              title: "Coast",
              paragraphs: [context, "Another private paragraph."],
            },
          ],
          position: anchor,
          bookmarks: [
            {
              id: "profile-bookmark-original",
              anchor,
              excerpt: context,
              createdAt: at,
            },
          ],
        },
      ],
    },
    "lexis.lexical-catalog.v1": catalog,
    "lexis.sense-contexts.v1": {
      version: 1,
      revision: 1,
      contexts: [
        {
          id: "profile-context-original",
          senseId,
          surface: "harbour",
          excerpt: context,
          source: { documentId: "profile-document-original", ...anchor },
          savedAt: at,
        },
      ],
    },
    "lexis.goals.v1": {
      version: 1,
      goals: [
        {
          id: "profile-goal-original",
          title: "Use my own words",
          term: "short",
          domain: "General English",
          skill: "recall",
          measure: "independent-attempts",
          targetCount: 5,
          cadence: "7-days",
          createdAt: at,
          updatedAt: at,
          revision: 1,
          archived: false,
        },
      ],
    },
    "lexis.preferences.v1": {
      ...DEFAULT_PREFERENCES,
      revision: 1,
      dailyItems: 7,
      onboardingCompleted: true,
    },
    "lexis.reader.preferences.v1": {
      ...DEFAULT_READER_PREFERENCES,
      font: "serif",
      fontSize: 23,
    },
    "lexis.practice-session.v1": {
      version: 1,
      revision: 1,
      startedAt: later,
      attemptIds: [attempt.id],
      senseId,
      format: "recall",
    },
    "lexis.tutor.v1:local": tutor,
  };
  const session = {
    id: `session:${mediaId}`,
    sourceId: mediaId,
    revision: 4,
    position: 1.25,
    duration: 3,
    playbackRate: 0.75,
    repeatStart: 0.5,
    repeatEnd: 2,
    repeatEnabled: true,
    transcript: "An original permitted test transcript. Своя запись.",
    transcriptVisibility: "partial" as const,
    transcriptRevealedAt: later,
    playedSeconds: 1.25,
  };
  return {
    values,
    raw: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
    writing,
    session,
  };
}

async function installProfile(page: Page, capture?: ProfileCapture | null) {
  const fixture = profileFixture();
  const audio = await readFile(resolve("public/audio/lexis-coast.wav"));
  await page.goto("/settings/backup");
  await capture?.state(
    "empty-inventory",
    "First-use profile backup inventory before any fixture is installed. No learning progress is invented.",
  );
  await page.evaluate(
    async ({ fixture, audio, mediaId, at, ignoredToken }) => {
      for (const [key, value] of Object.entries(fixture.raw))
        localStorage.setItem(key, value);
      // Generated credential-shaped values must not be enumerated into backups.
      localStorage.setItem("sb-fixture-auth-token", ignoredToken);
      localStorage.setItem("lexis.tutor.v1:account:other-owner", ignoredToken);
      sessionStorage.setItem("lexis.dictionary.context.v1", ignoredToken);
      const write = (
        name: string,
        stores: string[],
        rows: { store: string; key?: string; value: unknown }[],
      ) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => {
            for (const store of stores)
              request.result.createObjectStore(
                store,
                store === "workspaces" ? undefined : { keyPath: "id" },
              );
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(stores, "readwrite");
            for (const row of rows) {
              const store = transaction.objectStore(row.store);
              if (row.key) store.put(row.value, row.key);
              else store.put(row.value);
            }
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onabort = () => reject(transaction.error);
          };
        });
      await write(
        "lexis.writing.v1",
        ["workspaces"],
        [{ store: "workspaces", key: "local", value: fixture.writing }],
      );
      const bytes = new Uint8Array(audio).buffer;
      await write(
        "lexis.media.local.v1",
        ["assets", "sessions"],
        [
          {
            store: "assets",
            value: {
              id: mediaId,
              owner: "local",
              title: "My coast recording",
              fileName: "my-coast.wav",
              mime: "audio/wav",
              kind: "audio",
              byteLength: bytes.byteLength,
              createdAt: at,
              encoding: "array-buffer-v1",
              data: bytes,
            },
          },
          { store: "sessions", value: fixture.session },
        ],
      );
    },
    { fixture, audio: [...audio], mediaId, at, ignoredToken },
  );
  await page.reload();
  await capture?.state(
    "populated-inventory",
    "The actual inventory of original saved meanings, challenged observations, FSRS tasks, chapters, writing branches and a local recording.",
    page.getByRole("region", { name: "Export local profile", exact: true }),
  );
  return {
    fixture,
    audioHash: createHash("sha256").update(audio).digest("hex"),
  };
}

async function downloadProfile(page: Page) {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export selected profile", exact: true })
    .click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/\.lexis$/u);
  return readFile((await download.path())!);
}

async function freshContext(
  browser: Browser,
  baseURL: string | undefined,
  testInfo: TestInfo,
) {
  return browser.newContext({
    ...(testInfo.project.name === "iphone-webkit"
      ? { ...devices["iPhone 13"], reducedMotion: "reduce" as const }
      : {
          ...devices["Desktop Chrome"],
          viewport: { width: 1440, height: 1050 },
        }),
    baseURL: baseURL ?? "http://127.0.0.1:3000",
    acceptDownloads: true,
  });
}

async function previewFile(page: Page, buffer: Buffer) {
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "original-profile.lexis",
    mimeType: "application/octet-stream",
    buffer,
  });
  await page
    .getByRole("button", { name: "Preview selected sections", exact: true })
    .click();
  await expect(page.getByTestId("profile-preview")).toBeVisible();
}

async function confirmRestore(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I have saved my work and reviewed this merge.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Restore reviewed sections", exact: true })
    .click();
}

async function openRestoredProfile(page: Page) {
  const open = page.getByRole("button", {
    name: "Open restored profile",
    exact: true,
  });
  await expect(open).toBeEnabled();
  // Recovery changes the local generation: a genuine document navigation is
  // required before the previously suspended repositories can be used again.
  await Promise.all([page.waitForEvent("domcontentloaded"), open.click()]);
}

async function readProfile(page: Page) {
  return page.evaluate(
    async ({ localKeys, mediaId }) => {
      const read = (name: string, storeName: string, key?: string) =>
        new Promise<unknown>((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onupgradeneeded = () => request.transaction?.abort();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const get = key ? store.get(key) : store.getAll();
            let result: unknown;
            get.onsuccess = () => {
              result = get.result;
            };
            transaction.oncomplete = () => {
              database.close();
              resolve(result);
            };
            transaction.onabort = () => reject(transaction.error);
          };
        });
      const asset = (await read("lexis.media.local.v1", "assets", mediaId)) as {
        blob?: Blob;
        data?: ArrayBuffer;
        id: string;
        title: string;
      };
      const bytes = asset.blob ? await asset.blob.arrayBuffer() : asset.data!;
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return {
        raw: Object.fromEntries(
          localKeys.map((key) => [key, localStorage.getItem(key)]),
        ),
        writing: await read("lexis.writing.v1", "workspaces", "local"),
        session: await read(
          "lexis.media.local.v1",
          "sessions",
          `session:${mediaId}`,
        ),
        assets: (await read("lexis.media.local.v1", "assets")) as unknown[],
        asset: {
          id: asset.id,
          title: asset.title,
          sha256: [...new Uint8Array(hash)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
        },
      };
    },
    { localKeys: [...localKeys], mediaId },
  );
}

test("a whole local profile restores stable histories, draft branches and playable media into a fresh profile without renewing Tutor consent", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const inventoryCapture = await profileCapture(page, testInfo, "inventory");
  let installed: Awaited<ReturnType<typeof installProfile>>;
  try {
    installed = await installProfile(page, inventoryCapture);
    await inventoryCapture?.finish(true);
  } catch (cause) {
    await inventoryCapture?.finish(false);
    throw cause;
  }
  const { fixture, audioHash } = installed;
  const backup = await downloadProfile(page);
  expect(backup.includes(Buffer.from(ignoredToken))).toBe(false);
  const container = await openProfileBackupContainer(
    new Blob([new Uint8Array(backup)]),
  );
  await container.verifyAll();
  const catalogRaw = parseProfileJsonBody(
    await container.readJsonPart("section:catalog"),
  );
  expect(JSON.parse(catalogRaw!)).toEqual(
    fixture.values["lexis.lexical-catalog.v1"],
  );
  const archivedTutor = parseProfileJsonBody(
    await container.readJsonPart("section:tutor-local"),
  );
  expect(JSON.parse(archivedTutor!).sessions[0].pendingRequest.consent).toBe(
    true,
  );

  const destination = await freshContext(browser, baseURL, testInfo);
  let capture: ProfileCapture | null = null;
  let successful = false;
  try {
    const restored = await destination.newPage();
    capture = await profileCapture(restored, testInfo, "roundtrip");
    const runtimeErrors: string[] = [];
    restored.on("pageerror", (error) => runtimeErrors.push(error.message));
    await restored.goto("/settings/backup");
    const preferences = { ...DEFAULT_PREFERENCES, dailyItems: 3, revision: 2 };
    await restored.evaluate((value) => {
      localStorage.setItem("lexis.preferences.v1", JSON.stringify(value));
    }, preferences);
    await restored.reload();
    await previewFile(restored, backup);
    await capture?.state(
      "valid-preview",
      "A real additive preview in a separate browser profile: preserved IDs, branch histories and locally stored media; current device settings are kept.",
      restored.getByTestId("profile-preview"),
    );
    await confirmRestore(restored);
    await expect(
      restored.getByRole("button", {
        name: "Open restored profile",
        exact: true,
      }),
    ).toBeEnabled();
    await capture?.state(
      "completed-restoration",
      "All selected target steps have been applied and read back. Ordinary editing remains paused until explicit full navigation.",
      restored.getByRole("region", {
        name: "Recorded restoration",
        exact: true,
      }),
    );
    await openRestoredProfile(restored);
    await expect
      .poll(() =>
        restored.evaluate(() =>
          localStorage.getItem("lexis.profile-restore.v1"),
        ),
      )
      .toBeNull();
    const snapshot = await readProfile(restored);
    for (const key of localKeys.filter(
      (item) =>
        ![
          "lexis.preferences.v1",
          "lexis.reader.preferences.v1",
          "lexis.tutor.v1:local",
        ].includes(item),
    ))
      expect(JSON.parse(snapshot.raw[key]!)).toEqual(fixture.values[key]);
    expect(JSON.parse(snapshot.raw["lexis.preferences.v1"]!)).toEqual(
      preferences,
    );
    expect(snapshot.raw["lexis.reader.preferences.v1"]).toBeNull();
    expect(snapshot.writing).toEqual(fixture.writing);
    expect(snapshot.session).toEqual(fixture.session);
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.asset).toEqual({
      id: mediaId,
      title: "My coast recording",
      sha256: audioHash,
    });
    const tutor = JSON.parse(snapshot.raw["lexis.tutor.v1:local"]!);
    expect(tutor.sessions[0].pendingRequest).toBeUndefined();
    expect(tutor.sessions[0].messages[0].status).toBe("cancelled");
    expect(tutor.sessions[0].messages[0].text).toBe(
      "Please explain only my selected excerpt.",
    );
    expect(
      await restored.evaluate(() =>
        localStorage.getItem("sb-fixture-auth-token"),
      ),
    ).toBeNull();

    await restored.goto(`/listening?source=${mediaId}`);
    await expect(
      restored.getByRole("heading", {
        name: "My coast recording",
        exact: true,
      }),
    ).toBeVisible();
    await restored.waitForFunction(() => {
      const player = document.querySelector("audio");
      return (
        !!player && Number.isFinite(player.duration) && player.duration > 1
      );
    });
    await restored
      .getByRole("button", { name: "Play recording", exact: true })
      .click();
    await restored.waitForFunction(() => {
      const player = document.querySelector("audio");
      return !!player && !player.paused && player.currentTime > 1.3;
    });
    await restored
      .getByRole("button", { name: "Pause recording", exact: true })
      .click();
    expect(runtimeErrors).toEqual([]);
    successful = true;
  } finally {
    try {
      await capture?.finish(successful);
    } finally {
      await destination.close();
    }
  }
});

test("reapplying an exported local profile preserves every stable identity, history and media file without renewing pending Tutor work", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const { fixture, audioHash } = await installProfile(page);
  const backup = await downloadProfile(page);
  // Existing identical data exercise the additive retry path without needing
  // a second fresh-profile import and audio playback in the same timed journey.
  await previewFile(page, backup);
  await confirmRestore(page);
  await openRestoredProfile(page);
  const snapshot = await readProfile(page);
  for (const key of localKeys.filter((item) => item !== "lexis.tutor.v1:local"))
    expect(JSON.parse(snapshot.raw[key]!)).toEqual(fixture.values[key]);
  expect(snapshot.writing).toEqual(fixture.writing);
  expect(snapshot.session).toEqual(fixture.session);
  expect(snapshot.assets).toHaveLength(1);
  expect(snapshot.asset).toEqual({
    id: mediaId,
    title: "My coast recording",
    sha256: audioHash,
  });
  const tutor = JSON.parse(snapshot.raw["lexis.tutor.v1:local"]!);
  expect(tutor.sessions[0].pendingRequest).toBeUndefined();
  expect(tutor.sessions[0].messages[0].status).toBe("cancelled");
  expect(tutor.sessions[0].messages[0].text).toBe(
    "Please explain only my selected excerpt.",
  );

  // A second confirmed replay of that same exported file must neither invent
  // IDs nor reinstate pending AI work. Verify canonical data, not spinner state.
  await previewFile(page, backup);
  const secondButton = page.getByRole("button", {
    name: "Restore reviewed sections",
    exact: true,
  });
  await page
    .getByRole("checkbox", {
      name: "I have saved my work and reviewed this merge.",
      exact: true,
    })
    .check();
  await expect(secondButton).toBeEnabled();
  await secondButton.click();
  await openRestoredProfile(page);
  const repeated = await readProfile(page);
  expect(repeated.writing).toEqual(snapshot.writing);
  expect(repeated.session).toEqual(snapshot.session);
  expect(repeated.assets).toHaveLength(1);
  expect(repeated.asset).toEqual(snapshot.asset);
  for (const key of localKeys)
    expect(JSON.parse(repeated.raw[key]!)).toEqual(
      JSON.parse(snapshot.raw[key]!),
    );
  expect(runtimeErrors).toEqual([]);
});

test("a tampered container or a conflicting sense identity cannot overwrite existing profile bytes", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await installProfile(page);
  const backup = await downloadProfile(page);
  const destination = await freshContext(browser, baseURL, testInfo);
  let capture: ProfileCapture | null = null;
  let successful = false;
  try {
    const restored = await destination.newPage();
    capture = await profileCapture(restored, testInfo, "conflict");
    const { fixture } = await installProfile(restored);
    const catalog = JSON.parse(fixture.raw["lexis.lexical-catalog.v1"]);
    catalog.entries[0].senses[0].definition =
      "A different original definition with the same ID.";
    const conflictingRaw = JSON.stringify(catalog);
    await restored.evaluate(
      (value) => localStorage.setItem("lexis.lexical-catalog.v1", value),
      conflictingRaw,
    );
    await restored.reload();
    const before = await readProfile(restored);
    const damaged = Buffer.from(backup);
    damaged[damaged.length - 1] ^= 1;
    await restored.getByLabel("Backup file", { exact: true }).setInputFiles({
      name: "damaged.lexis",
      mimeType: "application/octet-stream",
      buffer: damaged,
    });
    await expect(restored.getByRole("main").getByRole("alert")).toContainText(
      /integrity|checksum|damaged|could not|does not match/u,
    );
    expect((await readProfile(restored)).raw).toEqual(before.raw);
    await previewFile(restored, backup);
    await expect(restored.getByTestId("profile-preview")).toContainText(
      /conflict|different|cannot/u,
    );
    await restored
      .getByRole("checkbox", {
        name: "I have saved my work and reviewed this merge.",
        exact: true,
      })
      .check();
    await expect(
      restored.getByRole("button", {
        name: "Restore reviewed sections",
        exact: true,
      }),
    ).toBeDisabled();
    await capture?.state(
      "conflicting-preview",
      "A same-ID definition with different original content blocks restoration. Existing local records, writing branches and recording bytes remain unchanged.",
      restored.getByTestId("profile-preview"),
    );
    const after = await readProfile(restored);
    expect(after.raw).toEqual(before.raw);
    expect(after.writing).toEqual(before.writing);
    expect(after.asset).toEqual(before.asset);
    expect(after.session).toEqual(before.session);
    successful = true;
  } finally {
    try {
      await capture?.finish(successful);
    } finally {
      await destination.close();
    }
  }
});

test("a storage write failure leaves resumable progress and retry after reload does not duplicate applied learning", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { fixture } = await installProfile(page);
  const backup = await downloadProfile(page);
  const destination = await freshContext(browser, baseURL, testInfo);
  let capture: ProfileCapture | null = null;
  let successful = false;
  try {
    const restored = await destination.newPage();
    capture = await profileCapture(restored, testInfo, "interrupted");
    await restored.goto("/settings/backup");
    await previewFile(restored, backup);
    // Exercise the real quota-error path after earlier selected stores commit.
    await restored.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "lexis.materials.v1")
          throw new DOMException(
            "Generated storage quota failure",
            "QuotaExceededError",
          );
        return original.call(this, key, value);
      };
    });
    await confirmRestore(restored);
    await expect
      .poll(() =>
        restored.evaluate(() => {
          const raw = localStorage.getItem("lexis.profile-restore.v1");
          return raw ? JSON.parse(raw).status : null;
        }),
      )
      .toBe("partial");
    await capture?.state(
      "interrupted-restoration",
      "A deliberately induced local materials write failure leaves confirmed earlier steps and an explicit resumable journal; this is an original fixture, not an actual provider incident.",
      restored.getByRole("region", {
        name: "Recorded restoration",
        exact: true,
      }),
    );
    const partial = await restored.evaluate(() => ({
      marker: JSON.parse(localStorage.getItem("lexis.profile-restore.v1")!),
      learning: localStorage.getItem("lexis.learning.v1"),
      tasks: localStorage.getItem("lexis.tasks.v1"),
      materials: localStorage.getItem("lexis.materials.v1"),
    }));
    expect(partial.marker.completed.length).toBeGreaterThan(0);
    expect(JSON.parse(partial.learning!)).toEqual(
      fixture.values["lexis.learning.v1"],
    );
    expect(partial.materials).toBeNull();
    await restored.reload();
    await restored
      .getByRole("button", { name: "Resume restoration", exact: true })
      .click();
    await openRestoredProfile(restored);
    const finished = await readProfile(restored);
    expect(JSON.parse(finished.raw["lexis.learning.v1"]!)).toEqual(
      fixture.values["lexis.learning.v1"],
    );
    expect(JSON.parse(finished.raw["lexis.tasks.v1"]!)).toEqual(
      fixture.values["lexis.tasks.v1"],
    );
    expect(finished.writing).toEqual(fixture.writing);
    expect(finished.session).toEqual(fixture.session);
    expect(finished.assets).toHaveLength(1);
    successful = true;
  } finally {
    try {
      await capture?.finish(successful);
    } finally {
      await destination.close();
    }
  }
});
