/** Reproducible Node-only observations, not browser/device or network benchmarks. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import {
  normalizeImportRows,
  parseDelimited,
} from "../src/domain/imports/lexical-import";
import { EditorialDictionaryLookup } from "../src/infrastructure/dictionary/editorial-lookup";

const round = (value: number) => Number(value.toFixed(6));
function summary(samples: number[]) {
  assert(samples.length > 0);
  const ordered = [...samples].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    ordered[Math.ceil(ordered.length * fraction) - 1];
  return {
    samples: ordered.length,
    minMs: round(ordered[0]),
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(ordered.at(-1)!),
  };
}
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const terms = [
  "ＬＩＮＧＥＲ",
  "traced",
  "don’t",
  "mother-in-law",
  "café",
  "take a glimpse",
  "wander",
  "quiet",
];
const cells: string[][] = [];
for (let index = 0; index < 1000; index++) {
  cells.push(
    index > 0 && index % 20 === 0
      ? [...cells[index - 1]]
      : [
          terms[index % terms.length],
          `перевод ${index} — спокойный берег`,
          `Example ${index}: “We don’t hurry.” A café, a path and a book 📚.\nAn original second line.`,
          "LEXIS original benchmark fixture",
          index % 2 ? "verb" : "phrase",
        ],
  );
}
const fixture =
  "\uFEFFWord,Translation,Context,Source,POS\r\n" +
  cells.map((row) => row.map(quote).join(",")).join("\r\n");
async function importFixture() {
  const progress = { parse: 0, normalize: 0 };
  const rows = await parseDelimited(fixture, ",", {
    onProgress: () => {
      progress.parse++;
    },
  });
  const normalized = await normalizeImportRows(
    rows,
    "benchmark-original-1000",
    {
      onProgress: () => {
        progress.normalize++;
      },
    },
  );
  return { normalized, progress };
}
for (let index = 0; index < 3; index++) await importFixture();
const batchTimes: number[] = [];
const timerGaps: number[] = [];
let lastTimer = performance.now();
let parseProgress = 0;
let normalizationProgress = 0;
const probe = setInterval(() => {
  const now = performance.now();
  timerGaps.push(now - lastTimer);
  lastTimer = now;
}, 1);
try {
  for (let index = 0; index < 30; index++) {
    const start = performance.now();
    const { normalized, progress } = await importFixture();
    batchTimes.push(performance.now() - start);
    assert.equal(normalized.length, 1000);
    assert.equal(normalized.filter((row) => row.duplicateOf).length, 49);
    assert.equal(normalized[0].term, "ＬＩＮＧＥＲ"); // Original text survives normalization.
    assert(
      normalized.every(
        (row) => row.disposition === "pending" && row.senseId === null,
      ),
    );
    assert(progress.parse > 1 && progress.normalize > 1);
    parseProgress += progress.parse;
    normalizationProgress += progress.normalize;
  }
} finally {
  clearInterval(probe);
}

async function cancellation(phase: "parse" | "normalize") {
  const controller = new AbortController();
  let requestedAt = 0;
  let requestedAfterUnits = 0;
  let progressCalls = 0;
  const onProgress = (processed: number) => {
    progressCalls++;
    if (
      !controller.signal.aborted &&
      processed >= (phase === "parse" ? 32_768 : 100)
    ) {
      requestedAfterUnits = processed;
      requestedAt = performance.now();
      controller.abort();
    }
  };
  try {
    if (phase === "parse")
      await parseDelimited(fixture, ",", {
        signal: controller.signal,
        onProgress,
      });
    else
      await normalizeImportRows(
        [["Word", "Translation", "Context", "Source", "POS"], ...cells],
        "cancelled-benchmark",
        { signal: controller.signal, onProgress },
      );
    throw new Error("Cancellation unexpectedly returned an import.");
  } catch (cause) {
    assert(cause instanceof Error && /Import cancelled/u.test(cause.message));
    assert(requestedAt > 0);
    return {
      requestedAfterUnits,
      progressCalls,
      observedRejectionAfterMs: round(performance.now() - requestedAt),
      returnedImport: false,
    };
  }
}
const cancelled = {
  parse: await cancellation("parse"),
  normalize: await cancellation("normalize"),
};
const lookup = new EditorialDictionaryLookup();
const queries = [
  "linger",
  "ＬＩＮＧＥＲ",
  "lingered",
  "  trace… ",
  "take a glimpse",
  "don’t",
  "mother-in-law",
  "café",
  "задерживаться",
  "quiet",
  "WANDERED",
  "traces",
  "‘trace’",
  "A phrase 📚",
  "след",
  "glimpse",
];
for (const query of queries) await lookup.lookup({ query });
const lookupTimes: number[] = [];
const results: Record<string, number> = {};
for (let batch = 0; batch < 200; batch++)
  for (const query of queries) {
    const start = performance.now();
    const result = await lookup.lookup({
      query,
      context: "An original permitted context: “We linger by the sea.”",
    });
    lookupTimes.push(performance.now() - start);
    results[result.status] = (results[result.status] ?? 0) + 1;
  }
async function sourceProvenance() {
  const gitEntry = resolve(".git");
  const gitDirectory = (await stat(gitEntry)).isDirectory()
    ? gitEntry
    : resolve(
        (await readFile(gitEntry, "utf8")).trim().replace(/^gitdir: /u, ""),
      );
  const head = (await readFile(resolve(gitDirectory, "HEAD"), "utf8")).trim();
  let sha = head;
  if (head.startsWith("ref: refs/")) {
    const reference = head.slice(5);
    assert(!reference.includes("..") && !reference.includes("\\"));
    try {
      sha = (await readFile(resolve(gitDirectory, reference), "utf8")).trim();
    } catch {
      const packed = await readFile(
        resolve(gitDirectory, "packed-refs"),
        "utf8",
      );
      sha =
        packed
          .split("\n")
          .find((line) => line.endsWith(` ${reference}`))
          ?.split(" ")[0] ?? "";
    }
  }
  assert(
    /^[a-f0-9]{40,64}$/u.test(sha),
    "Readable Git source identity is required.",
  );
  const paths = [
    "scripts/measure-local-paths.ts",
    "src/domain/imports/lexical-import.ts",
    "src/domain/imports/types.ts",
    "src/domain/contextual-lookup.ts",
    "src/infrastructure/dictionary/editorial-lookup.ts",
    "src/infrastructure/dictionary/seed.ts",
  ];
  const digests = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    })),
  );
  return {
    head: sha,
    sourceFiles: digests,
    workingTreeState:
      "Not inferred from HEAD; the digests identify exact benchmarked modules, including uncommitted changes.",
  };
}
const output = {
  measuredAt: new Date().toISOString(),
  source: await sourceProvenance(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    availableParallelism: availableParallelism(),
  },
  fixture: {
    rows: 1000,
    duplicateRows: 49,
    characters: fixture.length,
    utf8Bytes: Buffer.byteLength(fixture),
    provenance:
      "Original generated benchmark fixture; no learner data or external provider.",
  },
  import: {
    warmupRunsExcluded: 3,
    completeParseAndNormalize: summary(batchTimes),
    defaultCooperativeYield:
      "Production setTimeout(0) behavior, not bypassed by a synchronous test stub.",
    parseProgressCalls: parseProgress,
    normalizationProgressCalls: normalizationProgress,
    observedOneMsTimerGaps: summary(timerGaps),
    cancellation: cancelled,
  },
  editorialLookup: {
    warmupBatchesExcluded: 1,
    batches: 200,
    queriesPerBatch: queries.length,
    duration: summary(lookupTimes),
    resultCounts: results,
    coverage:
      "Eight-entry editorial adapter only; unknown forms/phrases are not provider coverage.",
  },
  limitations: [
    "Node container observations while other checks may run; not iPhone/browser main-thread/LCP/INP/CLS or field p75 measurements.",
    "Nearest-rank p50/p95 describe this run's samples; no confidence interval or cross-device SLO is inferred.",
    "Timer intervals include cooperative yield and runtime contention; they are not a browser Long Tasks trace.",
    "No React render, routing, storage commit, media, hosted SQL, network, API cost or private corpus is exercised.",
  ],
};
const serialized = JSON.stringify(output, null, 2) + "\n";
if (process.argv[2]) await writeFile(process.argv[2], serialized);
process.stdout.write(serialized);
