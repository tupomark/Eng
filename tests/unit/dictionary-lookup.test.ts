import { describe, expect, it } from "vitest";
import {
  extractLookupContext,
  lookupTokens,
  normalizeLookupQuery,
  sentenceSpans,
  validLookupSelection,
} from "@/domain/contextual-lookup";
import {
  EditorialDictionaryLookup,
  UnconfiguredDictionaryLookup,
} from "@/infrastructure/dictionary/editorial-lookup";
import {
  createDictionaryContextLink,
  clearDictionaryVisits,
  DICTIONARY_CONTEXT_KEY,
  loadDictionaryVisit,
  safeDictionaryReturnHref,
} from "@/infrastructure/dictionary/context-navigation";

describe("bounded contextual lookup", () => {
  it("keeps Unicode, contractions, hyphenated words and UTF-16 source offsets intact", () => {
    const source = "🌒 We can’t re-enter café; привет and cafe\u0301.";
    const tokens = lookupTokens(source);
    expect(tokens.map((span) => span.text)).toEqual([
      "We",
      "can’t",
      "re-enter",
      "café",
      "привет",
      "and",
      "cafe\u0301",
    ]);
    for (const span of tokens)
      expect(source.slice(span.start, span.end)).toBe(span.text);
    expect(normalizeLookupQuery("  “LINGERED!”  ")).toBe("lingered");
    expect(normalizeLookupQuery("I can’t\nre‑enter")).toBe("i can't re-enter");
    expect(source).toContain("can’t");
  });

  it("allows bounded phrases across line breaks and rejects empty, oversized or unsafe selections", () => {
    expect(validLookupSelection("catch a\nglimpse")).toBe(true);
    expect(validLookupSelection("небольшой контекст")).toBe(true);
    expect(validLookupSelection("can't re-enter")).toBe(true);
    for (const value of [
      "",
      "   ",
      "\u0000hello",
      "<script>",
      "word ".repeat(13),
      "a".repeat(161),
    ])
      expect(validLookupSelection(value)).toBe(false);
  });

  it("extracts the selected sentence without rewriting punctuation or surrounding Unicode", () => {
    const source = "🌒 A quiet morning. We can’t linger here. Затем — тишина.";
    const start = source.indexOf("can’t");
    const result = extractLookupContext(
      source,
      start,
      start + "can’t linger".length,
    );
    expect(result?.surface).toBe("can’t linger");
    expect(result?.context).toBe("We can’t linger here. ");
    expect(source.slice(result!.contextStart, result!.contextEnd)).toBe(
      result?.context,
    );
    expect(
      sentenceSpans(source)
        .map((span) => span.text)
        .join(""),
    ).toBe(source);
  });

  it("bounds a long context around the selection and rejects invalid offsets", () => {
    const source =
      "Before ".repeat(200) + "catch a glimpse" + " after".repeat(200) + ".";
    const start = source.indexOf("catch");
    const result = extractLookupContext(source, start, start + 15, 200);
    expect(result?.context.length).toBeLessThanOrEqual(200);
    expect(result?.context).toContain("catch a glimpse");
    for (const offsets of [
      [-1, 2],
      [4, 3],
      [0, source.length + 1],
      [0.5, 2],
    ])
      expect(extractLookupContext(source, offsets[0], offsets[1])).toBeNull();
    expect(extractLookupContext(source, start, start + 15, 10)).toBeNull();
  });
});

describe("dictionary provider contract", () => {
  const provider = new EditorialDictionaryLookup();
  it("maps explicit editorial forms while keeping surface and all distinct senses", async () => {
    const result = await provider.lookup({ query: "Lingered," });
    expect(result.status).toBe("found");
    if (result.status !== "found") throw new Error("Expected editorial form");
    expect(result.coverage).toBe("editorial-sample");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      surface: "Lingered,",
      matchedBy: "form",
      entry: { lexeme: { lemma: "linger" } },
    });
    expect(result.matches[0].entry.senses.map((sense) => sense.id)).toEqual([
      "linger-stay",
      "linger-remain",
    ]);
    expect(result.matches[0].entry.provenance.kind).toBe("editorial");
  });

  it("searches translations and exact collocations without inventing unsupported POS/forms", async () => {
    const russian = await provider.lookup({ query: "задерживаться" });
    expect(
      russian.status === "found" && russian.matches[0].entry.lexeme.lemma,
    ).toBe("linger");
    const phrase = await provider.lookup({ query: "catch a glimpse" });
    expect(phrase.status === "found" && phrase.matches[0].matchedBy).toBe(
      "collocation",
    );
    const exact = await provider.lookup({ query: "quiet" });
    expect(
      exact.status === "found" &&
        exact.matches.map((match) => match.entry.lexeme.lemma),
    ).toEqual(["quiet"]);
    expect(await provider.lookup({ query: "deliberated" })).toEqual({
      status: "not-found",
      coverage: "editorial-sample",
    });
    expect(await provider.lookup({ query: "unlisted-lexeme" })).toEqual({
      status: "not-found",
      coverage: "editorial-sample",
    });
    expect(await provider.lookup({ query: "x".repeat(161) })).toEqual({
      status: "unavailable",
      reason: "invalid-input",
    });
  });

  it("honours cancellation before and during cache lookup; missing live config is never an empty success", async () => {
    const controller = new AbortController();
    const pending = provider.lookup({
      query: "trace",
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toEqual({ status: "cancelled" });
    expect(
      await provider.lookup({ query: "trace", signal: controller.signal }),
    ).toEqual({ status: "cancelled" });
    const external = new UnconfiguredDictionaryLookup();
    expect(external.capability).toMatchObject({
      configured: false,
      availableNow: false,
    });
    expect(await external.lookup({ query: "trace" })).toEqual({
      status: "unavailable",
      reason: "awaiting-configuration",
    });
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
const context = {
  surface: "linger",
  excerpt: "A private sentence inviting us to linger.",
  returnHref: "/reader/document-safe-id#paragraph-2",
  source: {
    documentId: "document-safe-id",
    documentVersion: "version-1",
    chapterId: "chapter-1",
    paragraphIndex: 2,
    characterOffset: 14,
  },
};
describe("private dictionary visit navigation", () => {
  it("stores bounded source context in the tab, preserves it on reload and keeps the excerpt out of URLs", () => {
    const storage = memoryStorage();
    const href = createDictionaryContextLink(
      { ...context, senseId: "linger-stay", level: "deep" },
      storage,
      "visit-1",
    );
    expect(href).toContain("visit=visit-1");
    expect(href).not.toContain("private");
    expect(loadDictionaryVisit("visit-1", storage)).toEqual(context);
    expect(
      new URL(href, "https://lexis.invalid").searchParams.get("return"),
    ).toBe(context.returnHref);
  });

  it("allows only internal source workspaces as return destinations", () => {
    for (const href of [
      "https://evil.invalid",
      "//evil.invalid",
      "/\\evil.invalid",
      "/api/delete",
      "/reader/../api",
      "/reader/%2f%2fevil",
      "/reader\u0000",
    ])
      expect(safeDictionaryReturnHref(href)).toBe("/library");
    expect(
      safeDictionaryReturnHref(
        "/reader?dictionaryVisit=visit-1#reader-word-0-1-2-3",
      ),
    ).toBe("/reader?dictionaryVisit=visit-1#reader-word-0-1-2-3");
    expect(safeDictionaryReturnHref("/writing/draft-1#selection")).toBe(
      "/writing/draft-1#selection",
    );
  });

  it("limits tab retention to twelve recent contexts and accepts bounded EPUB chapter paths", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 20; index += 1)
      createDictionaryContextLink(context, storage, `visit-${index}`);
    expect(loadDictionaryVisit("visit-0", storage)).toBeNull();
    expect(loadDictionaryVisit("visit-19", storage)).toEqual(context);
    expect(
      JSON.parse(storage.getItem(DICTIONARY_CONTEXT_KEY)!).visits,
    ).toHaveLength(12);
    const longChapter = {
      ...context,
      source: { ...context.source, chapterId: "x".repeat(512) },
    };
    createDictionaryContextLink(longChapter, storage, "epub-path");
    expect(
      loadDictionaryVisit("epub-path", storage)?.source?.chapterId,
    ).toHaveLength(512);
  });

  it("preserves unreadable bytes and propagates quota errors without claiming context was saved", () => {
    const storage = memoryStorage();
    storage.setItem(DICTIONARY_CONTEXT_KEY, "{damaged context");
    expect(() =>
      createDictionaryContextLink(context, storage, "visit-1"),
    ).toThrow();
    expect(storage.getItem(DICTIONARY_CONTEXT_KEY)).toBe("{damaged context");
    expect(() =>
      createDictionaryContextLink(
        context,
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Quota");
          },
        },
        "visit-1",
      ),
    ).toThrow("Quota");
  });

  it("removes private ephemeral context for an account switch or explicit device reset", () => {
    const storage = memoryStorage();
    createDictionaryContextLink(context, storage, "visit-1");
    clearDictionaryVisits(storage);
    expect(loadDictionaryVisit("visit-1", storage)).toBeNull();
    expect(storage.getItem(DICTIONARY_CONTEXT_KEY)).toBeNull();
  });
});
