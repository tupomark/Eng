import { describe, expect, it } from "vitest";
import { BrowserLearningRepository } from "@/infrastructure/storage/browser-repository";
import { BrowserTaskRepository } from "@/infrastructure/storage/browser-task-repository";
import { BrowserGoalRepository } from "@/infrastructure/storage/browser-goals";
import {
  assertLocalWritesAllowed,
  suspendLocalWrites,
} from "@/infrastructure/storage/local-write-guard";
import { LOCAL_PURGE_MARKER } from "@/infrastructure/storage/preferences";
import { emptyState } from "@/domain";
import { emptyTaskLearningState } from "@/domain/tasks/state";
import { emptyGoalState } from "@/domain/knowledge/goals";
function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    key: (index) => [...data.keys()][index] ?? null,
  };
}
describe("local deletion write barrier", () => {
  it("blocks stale null snapshots in every learning store before they recreate deleted data", () => {
    const storage = memory();
    storage.setItem(LOCAL_PURGE_MARKER, '{"status":"complete"}');
    expect(() =>
      new BrowserLearningRepository(storage).commit(emptyState(), null),
    ).toThrow(/deletion/);
    expect(() =>
      new BrowserTaskRepository(storage).commit(emptyTaskLearningState(), null),
    ).toThrow(/deletion/);
    expect(() =>
      new BrowserGoalRepository(storage).commit(emptyGoalState(), null),
    ).toThrow(/deletion/);
    expect(storage.length).toBe(1);
  });
  it("keeps this document paused even if another tab clears the durable marker", () => {
    const storage = memory();
    assertLocalWritesAllowed(storage);
    suspendLocalWrites();
    storage.removeItem(LOCAL_PURGE_MARKER);
    expect(() => assertLocalWritesAllowed(storage)).toThrow(/fresh profile/);
  });
});
