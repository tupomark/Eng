import { describe, expect, it } from "vitest";
import {
  addSenseContext,
  emptySenseContexts,
  mergeSenseContexts,
  parseSenseContexts,
  removeSenseContext,
  type SavedSenseContext,
} from "../../src/domain/sense-contexts";
import {
  BrowserSenseContextRepository,
  SENSE_CONTEXTS_KEY,
} from "../../src/infrastructure/storage/browser-sense-contexts";
const context = (
  id = "context-1",
  excerpt = "We linger by the sea.",
): SavedSenseContext => ({
  id,
  senseId: "linger-stay",
  surface: "linger",
  excerpt,
  savedAt: "2026-10-24T12:00:00.000Z",
  source: {
    documentId: "my-book",
    documentVersion: "v1",
    chapterId: "chapter-1",
    paragraphIndex: 0,
    characterOffset: 3,
  },
});
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
describe("durable sense contexts", () => {
  it("adds two exact sources to one sense without any learning evidence", () => {
    const first = addSenseContext(emptySenseContexts(), context());
    const second = addSenseContext(
      first,
      context("context-2", "We linger by the river."),
    );
    expect(second.contexts).toHaveLength(2);
    expect(second.contexts.map((item) => item.senseId)).toEqual([
      "linger-stay",
      "linger-stay",
    ]);
    expect(Object.keys(second).sort()).toEqual([
      "contexts",
      "revision",
      "version",
    ]);
    expect(first.contexts).toHaveLength(1);
  });
  it("repeated save of exact sense/source/excerpt keeps original ID/date/revision", () => {
    const first = addSenseContext(emptySenseContexts(), context());
    const repeated = addSenseContext(first, {
      ...context("different-delivery-id"),
      surface: "lingered",
      savedAt: "2026-10-25T00:00:00.000Z",
    });
    expect(repeated).toEqual(first);
  });
  it("same excerpt at another anchor or different sense remains distinct", () => {
    const first = addSenseContext(emptySenseContexts(), context());
    const second = addSenseContext(first, {
      ...context("context-2"),
      source: { ...context().source!, paragraphIndex: 4 },
    });
    const third = addSenseContext(second, {
      ...context("context-3"),
      senseId: "linger-remain",
    });
    expect(third.contexts).toHaveLength(3);
  });
  it("does not normalize away original Unicode/punctuation", () => {
    const excerpt = "We linger — cafe\u0301. Мой контекст 📝";
    expect(
      addSenseContext(emptySenseContexts(), context("unicode", excerpt))
        .contexts[0].excerpt,
    ).toBe(excerpt);
  });
  it("validated backup roundtrip/merge is additive/idempotent and rejects conflicting IDs", () => {
    const first = addSenseContext(emptySenseContexts(), context());
    const backup = parseSenseContexts(JSON.parse(JSON.stringify(first)));
    expect(mergeSenseContexts(emptySenseContexts(), backup)).toEqual(first);
    expect(mergeSenseContexts(first, backup)).toEqual(first);
    const conflict = addSenseContext(
      emptySenseContexts(),
      context("context-1", "A different passage."),
    );
    expect(() => mergeSenseContexts(first, conflict)).toThrow("conflicts");
    expect(first.contexts[0].excerpt).toBe("We linger by the sea.");
  });
  it("merges a full-capacity backup and preserves the original if a later incoming ID conflicts", () => {
    const current = {
      version: 1 as const,
      revision: 1_500,
      contexts: Array.from({ length: 1_500 }, (_, index) =>
        context(`source-${index}`, `Original source ${index}.`),
      ),
    };
    const incoming = {
      version: 1 as const,
      revision: 500,
      contexts: Array.from({ length: 500 }, (_, index) =>
        context(`new-${index}`, `Additional source ${index}.`),
      ),
    };
    const merged = mergeSenseContexts(current, incoming);
    expect(merged.contexts).toHaveLength(2_000);
    expect(merged.revision).toBe(2_000);
    expect(current.contexts).toHaveLength(1_500);
    const conflicting = {
      ...incoming,
      contexts: [
        ...incoming.contexts,
        context("source-0", "Conflicting source."),
      ],
    };
    expect(() => mergeSenseContexts(current, conflicting)).toThrow("conflicts");
    expect(current.contexts[0].excerpt).toBe("Original source 0.");
  });
  it("rejects malformed source/schema/duplicate identities instead of silently accepting", () => {
    const good = addSenseContext(emptySenseContexts(), context());
    for (const bad of [
      { ...good, version: 2 },
      { ...good, revision: -1 },
      {
        ...good,
        contexts: [
          { ...context(), source: { ...context().source, paragraphIndex: -1 } },
        ],
      },
      { ...good, contexts: [context(), context("another-id")] },
      { ...good, contexts: [{ ...context(), provider: "forged" }] },
    ])
      expect(() => parseSenseContexts(bad)).toThrow();
  });
  it("removes only the chosen passage and preserves other sources", () => {
    const state = addSenseContext(
      addSenseContext(emptySenseContexts(), context()),
      context("context-2", "We linger by the river."),
    );
    expect(
      removeSenseContext(state, "context-1").contexts.map((item) => item.id),
    ).toEqual(["context-2"]);
  });
  it("preserves malformed original bytes and rejects stale writes", () => {
    const storage = new Memory();
    const repository = new BrowserSenseContextRepository(storage);
    storage.setItem(SENSE_CONTEXTS_KEY, "{broken");
    expect(() => repository.read()).toThrow();
    expect(() =>
      repository.commit(
        addSenseContext(emptySenseContexts(), context()),
        "{broken",
      ),
    ).toThrow();
    expect(storage.getItem(SENSE_CONTEXTS_KEY)).toBe("{broken");
    storage.values.delete(SENSE_CONTEXTS_KEY);
    const first = repository.read();
    storage.setItem(SENSE_CONTEXTS_KEY, JSON.stringify(emptySenseContexts()));
    expect(() =>
      repository.commit(
        addSenseContext(first.state, context()),
        first.serialized,
      ),
    ).toThrow("another tab");
  });
  it("failed writes and deletion marker never acknowledge or recreate data", () => {
    const storage = new Memory();
    const repository = new BrowserSenseContextRepository(storage);
    const next = addSenseContext(emptySenseContexts(), context());
    storage.fail = true;
    expect(() => repository.commit(next, null)).toThrow("Quota");
    expect(storage.getItem(SENSE_CONTEXTS_KEY)).toBeNull();
    storage.fail = false;
    storage.setItem("lexis.local-purge.v1", "removing");
    expect(() => repository.commit(next, null)).toThrow("deletion");
    expect(storage.getItem(SENSE_CONTEXTS_KEY)).toBeNull();
  });
});
