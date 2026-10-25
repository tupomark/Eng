import { describe, expect, it } from "vitest";
import {
  addUserLexicalEntry,
  appendUserLexicalSense,
  createUserLexicalEntry,
  emptyUserLexicalCatalog,
  findDuplicateUserLexicalEntry,
  mergeUserLexicalCatalog,
  parseUserLexicalCatalog,
  previewUserLexicalRestore,
  type UserLexicalCatalog,
} from "../../src/domain/lexical-catalog";
import {
  BrowserUserLexicalRepository,
  USER_LEXICAL_CATALOG_KEY,
  USER_LEXICAL_CATALOG_LIMIT,
} from "../../src/infrastructure/storage/browser-lexical-catalog";

const at = "2026-10-25T00:00:00.000Z";
function entry(suffix = "one", definition = "An unlikely lucky discovery.") {
  return createUserLexicalEntry({
    lexemeId: `user-lexeme-${suffix}`,
    senseId: `user-sense-${suffix}`,
    lemma: "serendipity",
    partOfSpeech: "noun",
    definition,
    translation: "счастливая случайность",
    example: "Finding this book was serendipity.",
    at,
  });
}
class Memory {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
}
describe("private user-authored lexical catalog", () => {
  it("authoring records stable meaning identity and explicit provenance without learning evidence", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    expect(state.entries[0].senses[0].id).toBe("user-sense-one");
    expect(state.entries[0].provenance.kind).toBe("user-authored");
    expect(state.entries[0].provenance.rights).toContain(
      "no external dictionary",
    );
    expect(Object.keys(state).sort()).toEqual([
      "entries",
      "revision",
      "version",
    ]);
    expect(state.revision).toBe(1);
  });
  it("an exact duplicate delivery keeps original IDs, timestamp and revision", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const repeated = {
      ...entry("second-id"),
      createdAt: "2026-10-26T00:00:00.000Z",
    };
    expect(findDuplicateUserLexicalEntry(state, repeated)?.lexeme.id).toBe(
      "user-lexeme-one",
    );
    expect(addUserLexicalEntry(state, repeated)).toEqual(state);
  });
  it("never conflates another POS or a different definition, example or form", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const differentPos = {
      ...entry("verb"),
      lexeme: { ...entry("verb").lexeme, partOfSpeech: "verb" },
    };
    const withPos = addUserLexicalEntry(state, differentPos);
    const withMeaning = addUserLexicalEntry(
      withPos,
      entry("new", "The ability to make lucky discoveries."),
    );
    const newExample = entry("example");
    newExample.senses[0].example = "Serendipity led us here.";
    const final = addUserLexicalEntry(withMeaning, newExample);
    expect(final.entries).toHaveLength(4);
    const formed = { ...entry("forms"), forms: ["serendipities"] };
    expect(findDuplicateUserLexicalEntry(state, formed)).toBeNull();
  });
  it("explicitly appends a same-POS sense without changing original meaning content", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const next = appendUserLexicalSense(state, "user-lexeme-one", {
      id: "user-sense-two",
      definition: "The ability to notice useful accidental discoveries.",
    });
    expect(next.entries[0].senses).toHaveLength(2);
    expect(next.entries[0].senses[0]).toEqual(state.entries[0].senses[0]);
    expect(state.entries[0].senses).toHaveLength(1);
    expect(
      appendUserLexicalSense(next, "user-lexeme-one", {
        id: "user-sense-repeat",
        definition: "The ability to notice useful accidental discoveries.",
      }),
    ).toEqual(next);
  });
  it("preserves original Unicode and honest missing IPA/translation/example", () => {
    const item = createUserLexicalEntry({
      lexemeId: "user-lexeme-unicode",
      senseId: "user-sense-unicode",
      lemma: "cafe\u0301",
      partOfSpeech: "noun",
      definition: "A café — пример 📝.",
      at,
    });
    expect(item.lexeme.lemma).toBe("cafe\u0301");
    expect(item.lexeme.ipa).toBe("");
    expect(item.senses[0].translation).toBe("");
    expect(item.senses[0].example).toBe("");
    expect(item.senses[0].definition).toBe("A café — пример 📝.");
  });
  it("rejects impersonated external IDs/provenance, unknown fields and duplicate meaning IDs", () => {
    const good = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const item = good.entries[0];
    const malformed = [
      { ...good, version: 2 },
      { ...good, revision: -1 },
      { ...good, evidence: [] },
      {
        ...good,
        entries: [
          { ...item, provenance: { ...item.provenance, kind: "editorial" } },
        ],
      },
      {
        ...good,
        entries: [{ ...item, lexeme: { ...item.lexeme, id: "linger" } }],
      },
      {
        ...good,
        entries: [
          { ...item, senses: [{ ...item.senses[0], id: "linger-stay" }] },
        ],
      },
      {
        ...good,
        entries: [{ ...item, senses: [...item.senses, item.senses[0]] }],
      },
      {
        ...good,
        entries: [
          {
            ...item,
            senses: [{ ...item.senses[0], lexemeId: "user-lexeme-other" }],
          },
        ],
      },
      {
        ...good,
        entries: [{ ...item, forms: ["serendipities", "SERENDIPITIES"] }],
      },
      { ...good, entries: [{ ...item, forms: ["..."] }] },
    ];
    for (const bad of malformed)
      expect(() => parseUserLexicalCatalog(bad)).toThrow();
  });
  it("rejects changing an existing stable entry or sense under the same ID", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    expect(() =>
      addUserLexicalEntry(state, entry("one", "Different content.")),
    ).toThrow("different content");
    expect(() =>
      appendUserLexicalSense(state, "user-lexeme-one", {
        id: "user-sense-one",
        definition: "Different content.",
      }),
    ).toThrow("history has not been reassigned");
    expect(state.entries[0].senses[0].definition).toBe(
      "An unlikely lucky discovery.",
    );
  });
  it("roundtrips exact IDs and previews an additive restore without a write", () => {
    const original = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const backup = parseUserLexicalCatalog(
      JSON.parse(JSON.stringify(original)),
    );
    const preview = previewUserLexicalRestore(
      emptyUserLexicalCatalog(),
      backup,
    );
    expect(preview.entriesToAdd).toBe(1);
    expect(preview.sensesToAdd).toBe(1);
    expect(preview.conflicts).toEqual([]);
    expect(preview.merged).toEqual(original);
    expect(mergeUserLexicalCatalog(original, backup)).toEqual(original);
    expect(previewUserLexicalRestore(original, backup).unchangedEntries).toBe(
      1,
    );
  });
  it("restores appended senses and unrelated entries without dropping existing meanings", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const expanded = appendUserLexicalSense(state, "user-lexeme-one", {
      id: "user-sense-appended",
      definition: "Another explicitly selected meaning.",
    });
    const incoming = addUserLexicalEntry(
      expanded,
      entry("two", "Another authored definition."),
    );
    const preview = previewUserLexicalRestore(state, incoming);
    expect(preview.entriesToAdd).toBe(1);
    expect(preview.sensesToAdd).toBe(2);
    expect(preview.merged?.entries[0].senses).toHaveLength(2);
    expect(mergeUserLexicalCatalog(state, incoming).entries).toEqual(
      incoming.entries,
    );
  });
  it("restore preserves separately identified equal-looking historical senses instead of remapping references", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const incoming: UserLexicalCatalog = {
      version: 1,
      revision: 1,
      entries: [entry("second-identity")],
    };
    const merged = mergeUserLexicalCatalog(state, incoming);
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries.map((item) => item.senses[0].id)).toEqual([
      "user-sense-one",
      "user-sense-second-identity",
    ]);
  });
  it("a late restore ID conflict blocks the entire merge and keeps both source histories untouched", () => {
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const incoming: UserLexicalCatalog = {
      version: 1,
      revision: 2,
      entries: [
        entry("extra", "Additional definition."),
        entry("one", "Conflicting definition."),
      ],
    };
    const preview = previewUserLexicalRestore(state, incoming);
    expect(preview.merged).toBeNull();
    expect(preview.conflicts).toHaveLength(1);
    expect(() => mergeUserLexicalCatalog(state, incoming)).toThrow(
      "not been overwritten",
    );
    expect(state.entries).toHaveLength(1);
    expect(incoming.entries[0].lexeme.id).toBe("user-lexeme-extra");
  });
  it("preserves malformed original bytes and blocks stale-tab/failed/purge writes", () => {
    const storage = new Memory();
    const repo = new BrowserUserLexicalRepository(storage);
    const next = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    storage.setItem(USER_LEXICAL_CATALOG_KEY, "{broken");
    expect(() => repo.read()).toThrow();
    expect(() => repo.commit(next, "{broken")).toThrow();
    expect(storage.getItem(USER_LEXICAL_CATALOG_KEY)).toBe("{broken");
    storage.values.delete(USER_LEXICAL_CATALOG_KEY);
    const loaded = repo.read();
    storage.setItem(
      USER_LEXICAL_CATALOG_KEY,
      JSON.stringify(emptyUserLexicalCatalog()),
    );
    expect(() => repo.commit(next, loaded.serialized)).toThrow("another tab");
    storage.values.delete(USER_LEXICAL_CATALOG_KEY);
    storage.fail = true;
    expect(() => repo.commit(next, null)).toThrow("Quota");
    expect(storage.getItem(USER_LEXICAL_CATALOG_KEY)).toBeNull();
    storage.fail = false;
    storage.setItem("lexis.local-purge.v1", "removing");
    expect(() => repo.commit(next, null)).toThrow("deletion");
    expect(storage.getItem(USER_LEXICAL_CATALOG_KEY)).toBeNull();
  });
  it("rejects oversized stored bytes before parsing and roundtrips a valid committed catalog", () => {
    const storage = new Memory();
    const repo = new BrowserUserLexicalRepository(storage);
    storage.setItem(
      USER_LEXICAL_CATALOG_KEY,
      " ".repeat(USER_LEXICAL_CATALOG_LIMIT + 1),
    );
    expect(() => repo.read()).toThrow("too large");
    expect(storage.getItem(USER_LEXICAL_CATALOG_KEY)?.length).toBe(
      USER_LEXICAL_CATALOG_LIMIT + 1,
    );
    storage.values.delete(USER_LEXICAL_CATALOG_KEY);
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry());
    const serialized = repo.commit(state, null);
    expect(repo.read()).toEqual({ state, serialized });
  });
});
