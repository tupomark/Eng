import { describe, expect, it } from "vitest";
import { emptyState, saveSense } from "../../src/domain";
import {
  BrowserLearningRepository,
  STORAGE_KEY,
} from "../../src/infrastructure/storage/browser-repository";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites)
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    this.values.set(key, value);
  }
}

const saved = () =>
  saveSense(
    emptyState(),
    "linger-stay",
    "She lingered by the window.",
    "2026-10-21T12:00:00.000Z",
  );

describe("browser learning persistence", () => {
  it("starts empty without silently creating a stored record", async () => {
    const storage = new MemoryStorage();
    const repository = new BrowserLearningRepository(storage);
    expect(repository.read()).toEqual({
      state: emptyState(),
      serialized: null,
    });
    expect(await repository.load()).toEqual(emptyState());
    expect(storage.length).toBe(0);
  });

  it("round trips committed data and returns the snapshot used for the next write", () => {
    const storage = new MemoryStorage();
    const repository = new BrowserLearningRepository(storage);
    const serialized = repository.commit(saved(), null);
    expect(repository.read()).toEqual({ state: saved(), serialized });
    expect(storage.getItem(STORAGE_KEY)).toBe(serialized);
  });

  it("preserves the last durable state when the storage write fails", () => {
    const storage = new MemoryStorage();
    const repository = new BrowserLearningRepository(storage);
    const before = repository.commit(saved(), null);
    storage.failWrites = true;
    const next = saveSense(
      saved(),
      "linger-remain",
      "The memory lingered.",
      "2026-10-22T12:00:00.000Z",
    );
    expect(() => repository.commit(next, before)).toThrow(
      "Storage quota exceeded",
    );
    expect(repository.read()).toEqual({ state: saved(), serialized: before });
  });

  it("rejects a stale tab snapshot instead of replacing newer durable learning", () => {
    const storage = new MemoryStorage();
    const firstTab = new BrowserLearningRepository(storage);
    const secondTab = new BrowserLearningRepository(storage);
    const firstSnapshot = firstTab.read();
    const staleSnapshot = secondTab.read();
    firstTab.commit(saved(), firstSnapshot.serialized);
    const secondState = saveSense(
      staleSnapshot.state,
      "trace-mark",
      "A trace remained.",
      "2026-10-21T12:01:00.000Z",
    );
    expect(() =>
      secondTab.commit(secondState, staleSnapshot.serialized),
    ).toThrow("another tab");
    expect(firstTab.read().state).toEqual(saved());
  });

  it.each([
    "{invalid JSON",
    JSON.stringify({ ...emptyState(), version: 999 }),
    JSON.stringify({ ...emptyState(), saved: "corrupt" }),
  ])(
    "does not reset or overwrite unreadable persisted data %#",
    (serialized) => {
      const storage = new MemoryStorage();
      storage.setItem(STORAGE_KEY, serialized);
      expect(() => new BrowserLearningRepository(storage).read()).toThrow();
      expect(storage.getItem(STORAGE_KEY)).toBe(serialized);
    },
  );
});
