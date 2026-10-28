import { describe, expect, it } from "vitest";
import {
  changePreferences,
  DEFAULT_PREFERENCES,
  parsePreferences,
  type PreferenceChange,
} from "../../src/domain/preferences/preferences";
import {
  LOCAL_PURGE_MARKER,
  PREFERENCES_KEY,
  PreferencesRepository,
} from "../../src/infrastructure/storage/preferences";

class MemoryStore {
  values = new Map<string, string>();
  denied = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.denied) throw new Error("Storage is full.");
    this.values.set(key, value);
  }
}

describe("local preferences keep language, learning and appearance separate", () => {
  it("supports mixed explanations without translating the required task language", () => {
    const next = changePreferences(
      { ...DEFAULT_PREFERENCES },
      {
        uiLanguage: "ru",
        explanationLanguage: "mixed",
        reducedMotion: "reduce",
      },
    );
    expect(next).toMatchObject({
      uiLanguage: "ru",
      explanationLanguage: "mixed",
      taskLanguage: "en",
      reducedMotion: "reduce",
      revision: 1,
    });
  });
  it.each([
    { version: 2 },
    { taskLanguage: "ru" },
    { dailyItems: 0 },
    { dailyItems: 101 },
    { dailyItems: 1.5 },
    { revision: -1 },
    { revision: Number.MAX_SAFE_INTEGER },
    { uiLanguage: { toString: () => "en" } },
    { explanationLanguage: "auto" },
    { accent: "any" },
    { correctionStyle: "strict" },
    { privateWord: "unexpected field" },
  ])("rejects unsupported or malformed settings: %o", (patch) => {
    expect(() =>
      parsePreferences({ ...DEFAULT_PREFERENCES, ...patch }),
    ).toThrow();
  });
  it("does not permit a caller to override schema identity or task requirements", () => {
    for (const patch of [
      { version: 1 },
      { revision: 40 },
      { taskLanguage: "en" },
      { arbitrary: true },
    ]) {
      expect(() =>
        changePreferences(
          { ...DEFAULT_PREFERENCES },
          patch as PreferenceChange,
        ),
      ).toThrow();
    }
  });
  it("requires an initial read before writes and preserves unrelated stores", () => {
    const store = new MemoryStore();
    store.values.set("lexis.learning.v1", "learning bytes");
    const repository = new PreferencesRepository(store);
    expect(() => repository.change({ dailyItems: 10 })).toThrow(
      "Reload readable preferences",
    );
    repository.read();
    repository.change({ dailyItems: 10 });
    expect(store.getItem("lexis.learning.v1")).toBe("learning bytes");
    expect(JSON.parse(store.getItem(PREFERENCES_KEY)!)).toMatchObject({
      dailyItems: 10,
      revision: 1,
    });
  });
  it("detects a competing tab and never overwrites its preferences", () => {
    const store = new MemoryStore();
    const first = new PreferencesRepository(store);
    const second = new PreferencesRepository(store);
    first.read();
    second.read();
    second.change({ learningMode: "free" });
    const raw = store.getItem(PREFERENCES_KEY);
    expect(() => first.change({ dailyItems: 50 })).toThrow("another tab");
    expect(store.getItem(PREFERENCES_KEY)).toBe(raw);
    expect(first.read().learningMode).toBe("free");
  });
  it("preserves corrupted original bytes and blocks a write after failed validation", () => {
    const store = new MemoryStore();
    const raw = '{"version": 1, "broken';
    store.values.set(PREFERENCES_KEY, raw);
    const repository = new PreferencesRepository(store);
    expect(() => repository.read()).toThrow();
    expect(() => repository.change({ uiLanguage: "ru" })).toThrow();
    expect(store.getItem(PREFERENCES_KEY)).toBe(raw);
  });
  it("does not advance its baseline when storage rejects a write", () => {
    const store = new MemoryStore();
    const repository = new PreferencesRepository(store);
    repository.read();
    store.denied = true;
    expect(() => repository.change({ explanationLanguage: "ru" })).toThrow(
      "Storage is full",
    );
    expect(store.getItem(PREFERENCES_KEY)).toBeNull();
    store.denied = false;
    expect(repository.change({ dailyItems: 5 })).toMatchObject({
      revision: 1,
      dailyItems: 5,
      explanationLanguage: "en",
    });
  });
  it("blocks late preference changes while a deletion marker remains", () => {
    const store = new MemoryStore();
    const repository = new PreferencesRepository(store);
    repository.read();
    store.values.set(
      LOCAL_PURGE_MARKER,
      JSON.stringify({ status: "complete" }),
    );
    expect(() => repository.change({ accent: "AmE" })).toThrow();
    expect(store.getItem(PREFERENCES_KEY)).toBeNull();
  });
});
