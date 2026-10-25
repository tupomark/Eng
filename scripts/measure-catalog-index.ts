// Container-only index benchmark; run from repo root with node --import tsx scripts/measure-catalog-index.ts.
import { buildLocalCatalogExactIndex } from "../src/infrastructure/dictionary/local-catalog-lookup";
import { normalizeLookupQuery } from "../src/domain/contextual-lookup";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
const sourceHead = process.env.LEXIS_BENCHMARK_SHA;
if (!sourceHead || !/^[a-f0-9]{40}$/u.test(sourceHead))
  throw new Error(
    "Set LEXIS_BENCHMARK_SHA to the checked source commit before measuring.",
  );
const count = 2000;
const entries = Array.from({ length: count }, (_, i) => ({
  lexeme: {
    id: `user-lexeme-${i}`,
    lemma: `term${i}`,
    partOfSpeech: "noun",
    ipa: "",
  },
  forms: [`terms${i}`],
  senses: [
    {
      id: `user-sense-${i}`,
      lexemeId: `user-lexeme-${i}`,
      definition: `Original local note ${i}`,
      translation: "",
      example: "",
      collocations: [],
    },
  ],
  provenance: {
    provider: "LEXIS learner",
    version: "user-authored-v1",
    rights:
      "Private user-authored content; no external dictionary verification.",
    kind: "user-authored" as const,
  },
}));
const rows = Array.from({ length: 30 }, (_, i) => `missing${i}`);
let start = performance.now();
const original = rows.map((term) =>
  entries.filter(
    (candidate) =>
      normalizeLookupQuery(candidate.lexeme.lemma) ===
        normalizeLookupQuery(term) ||
      entries.some(
        (item) =>
          item.lexeme.id === candidate.lexeme.id &&
          item.forms.some(
            (form) => normalizeLookupQuery(form) === normalizeLookupQuery(term),
          ),
      ),
  ),
);
const legacyMs = performance.now() - start;
start = performance.now();
const index = buildLocalCatalogExactIndex(entries);
const buildIndexMs = performance.now() - start;
const indexedRuns = [];
for (let i = 0; i < 100; i++) {
  start = performance.now();
  const matches = rows.map(
    (term) => index.get(normalizeLookupQuery(term)) ?? [],
  );
  if (matches.some((m) => m.length)) throw Error("Unexpected missing match");
  indexedRuns.push(performance.now() - start);
}
const sorted = [...indexedRuns].sort((a, b) => a - b);
const result = {
  measuredAt: new Date().toISOString(),
  sourceHead,
  sourceSha256: createHash("sha256")
    .update(readFileSync("src/infrastructure/dictionary/local-catalog-lookup"))
    .digest("hex"),
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    availableParallelism: availableParallelism(),
  },
  workload: {
    catalogEntries: count,
    visibleInboxRows: rows.length,
    indexedRuns: indexedRuns.length,
  },
  results: {
    legacyQuadraticPredicateMs: legacyMs,
    legacyMatches: original.flat().length,
    buildIndexMs,
    indexed30RowsP50Ms: sorted[49],
    indexed30RowsP95Ms: sorted[94],
    exactFormMatches: index.get("terms1999")?.length,
  },
  limitations: [
    "Container Node microbenchmark; not iPhone, browser rendering, React reconciliation, web vitals or field p95.",
    "Index is rebuilt when catalog changes; this measures normalized exact-key lookup after construction.",
    "Absolute durations depend on concurrent machine load; regression cause is the eliminated nested full-catalog scan.",
  ],
};
writeFileSync(
  "docs/performance/2026-10-25-catalog-index.json",
  JSON.stringify(result, null, 2) + "\n",
);
process.stdout.write(JSON.stringify(result));
