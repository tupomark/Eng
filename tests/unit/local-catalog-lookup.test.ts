import { describe, expect, it } from "vitest";
import { createUserLexicalEntry } from "@/domain/lexical-catalog";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import {
  LocalCatalogDictionaryLookup,
  buildLocalCatalogExactIndex,
  localCatalogMatches,
} from "@/infrastructure/dictionary/local-catalog-lookup";

function authored(
  key: string,
  partOfSpeech: "noun" | "verb" = "noun",
  lemma = "harbour",
) {
  return createUserLexicalEntry({
    lexemeId: `user-lexeme-${key}`,
    senseId: `user-sense-${key}`,
    lemma,
    partOfSpeech,
    definition:
      partOfSpeech === "noun"
        ? "A sheltered place where boats can stop."
        : "To keep a thought privately for a time.",
    translation: partOfSpeech === "noun" ? "гавань" : "таить",
    forms: partOfSpeech === "verb" ? ["harboured", "harbouring"] : ["harbours"],
    at: "2026-10-25T10:00:00.000Z",
  });
}

describe("composite local dictionary lookup", () => {
  it("indexes normalized exact headword, form and phrase keys without selecting between competing sources", () => {
    const noun = authored("indexed-noun");
    noun.forms = ["HARBOURS", "harbour"];
    noun.senses[0].collocations = ["a safe harbour", "harbour"];
    const verb = authored("indexed-verb", "verb");
    const ownLinger = authored("indexed-own-linger", "verb", "linger");
    const index = buildLocalCatalogExactIndex([
      ...seedEntries,
      noun,
      verb,
      ownLinger,
    ]);
    expect(index.get("harbours")).toEqual([noun]);
    expect(index.get("a safe harbour")).toEqual([noun]);
    expect(index.get("harbour")).toEqual([noun, verb]);
    expect(index.get("lingered")?.[0].provenance.kind).toBe("editorial");
    expect(index.get("linger")?.map((entry) => entry.provenance.kind)).toEqual([
      "editorial",
      "user-authored",
    ]);
    expect(index.has("")).toBe(false);
    expect(index.has("sheltered place")).toBe(false);
    expect(buildLocalCatalogExactIndex([]).size).toBe(0);
  });
  it("keeps separate parts of speech and source identities for a shared spelling", async () => {
    const noun = authored("noun");
    const verb = authored("verb", "verb");
    const port = new LocalCatalogDictionaryLookup([...seedEntries, noun, verb]);
    const result = await port.lookup({ query: "HARBOUR," });
    expect(result.status).toBe("found");
    if (result.status !== "found") throw new Error("Expected own definitions");
    expect(result.coverage).toBe("local-catalog");
    expect(result.matches.map((match) => match.entry.lexeme.id)).toEqual([
      noun.lexeme.id,
      verb.lexeme.id,
    ]);
    expect(
      result.matches.every(
        (match) => match.entry.provenance.kind === "user-authored",
      ),
    ).toBe(true);
    expect(localCatalogMatches([noun, verb], "harbour")).toHaveLength(2);
  });

  it("maps only explicit own forms, preserving selected surface and partial-source fields", async () => {
    const verb = authored("verb", "verb");
    const result = await new LocalCatalogDictionaryLookup([verb]).lookup({
      query: "“Harboured!”",
    });
    expect(result.status).toBe("found");
    if (result.status !== "found") throw new Error("Expected an explicit form");
    expect(result.matches[0]).toMatchObject({
      matchedBy: "form",
      surface: "“Harboured!”",
      forms: ["harboured", "harbouring"],
      entry: { lexeme: { lemma: "harbour", ipa: "" } },
    });
    expect(
      await new LocalCatalogDictionaryLookup([verb]).lookup({
        query: "harboring",
      }),
    ).toEqual({
      status: "not-found",
      coverage: "local-catalog",
    });
  });

  it("searches own translations and definitions but does not let fuzzy text hide an exact entry", async () => {
    const noun = authored("noun");
    const port = new LocalCatalogDictionaryLookup([...seedEntries, noun]);
    const translation = await port.lookup({ query: "гавань" });
    expect(
      translation.status === "found" && translation.matches[0].entry.lexeme.id,
    ).toBe(noun.lexeme.id);
    const definition = await port.lookup({ query: "sheltered place" });
    expect(
      definition.status === "found" && definition.matches[0].matchedBy,
    ).toBe("text-search");
    const exact = await port.lookup({ query: "quiet" });
    expect(
      exact.status === "found" &&
        exact.matches.map((match) => match.entry.lexeme.lemma),
    ).toEqual(["quiet"]);
  });

  it("never conflates a user note with an existing editorial meaning", async () => {
    const own = authored("own-linger", "verb", "linger");
    const result = await new LocalCatalogDictionaryLookup([
      ...seedEntries,
      own,
    ]).lookup({ query: "linger" });
    expect(result.status).toBe("found");
    if (result.status !== "found") throw new Error("Expected both sources");
    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((match) => match.entry.provenance.kind)).toEqual([
      "editorial",
      "user-authored",
    ]);
    expect(
      result.matches[0].entry.senses.some(
        (sense) => sense.id === own.senses[0].id,
      ),
    ).toBe(false);
  });

  it("honours cancellation during lookup and bounds the context before returning any result", async () => {
    const port = new LocalCatalogDictionaryLookup([
      ...seedEntries,
      authored("noun"),
    ]);
    const controller = new AbortController();
    const pending = port.lookup({
      query: "harbour",
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toEqual({ status: "cancelled" });
    expect(
      await port.lookup({ query: "harbour", signal: controller.signal }),
    ).toEqual({ status: "cancelled" });
    expect(
      await port.lookup({ query: "harbour", context: "x".repeat(1001) }),
    ).toEqual({ status: "unavailable", reason: "invalid-input" });
    expect(await port.lookup({ query: "x".repeat(161) })).toEqual({
      status: "unavailable",
      reason: "invalid-input",
    });
  });
});
