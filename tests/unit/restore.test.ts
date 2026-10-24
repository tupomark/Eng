import { describe, expect, it } from "vitest";
import { emptyState, type LearningState } from "../../src/domain";
import { previewLearningRestore } from "../../src/domain/restore";
import { LearningSession } from "../../src/application/learning-session";
import { BrowserLearningRepository } from "../../src/infrastructure/storage/browser-repository";

const backup: LearningState = {
  version: 1,
  readerProgress: 42,
  saved: [
    {
      senseId: "legacy-unavailable",
      savedAt: "2026-10-20T00:00:00.000Z",
      context: "An original context.",
    },
  ],
  evidence: [
    {
      id: "not-a-uuid",
      senseId: "legacy-unavailable",
      source: "self-review",
      skill: "recognition",
      rating: "good",
      occurredAt: "2026-10-21T00:00:00.000Z",
      disputedAt: "2026-10-22T00:00:00.000Z",
    },
  ],
};

describe("local v1 backup restore", () => {
  it("restores original IDs, unavailable meanings, exclusions and reader position", () => {
    const result = previewLearningRestore(emptyState(), backup);
    expect(result.merged).toEqual(backup);
    expect(result.addedMeanings).toBe(1);
    expect(result.addedObservations).toBe(1);
    expect(previewLearningRestore(result.merged, backup)).toMatchObject({
      addedMeanings: 0,
      addedObservations: 0,
      duplicateObservations: 1,
      merged: backup,
    });
  });
  it("never reactivates excluded evidence from an older backup", () => {
    const older = structuredClone(backup);
    delete older.evidence[0].disputedAt;
    expect(previewLearningRestore(backup, older).merged).toEqual(backup);
    expect(previewLearningRestore(older, backup).merged).toEqual(backup);
  });
  it("blocks sense-context and observation identity collisions without changing either input", () => {
    const collision = structuredClone(backup);
    collision.saved[0].context = "A different context.";
    collision.evidence[0].rating = "easy";
    const before = JSON.stringify([backup, collision]);
    const result = previewLearningRestore(backup, collision);
    expect(result.merged).toBeNull();
    expect(result.conflicts.map((item) => item.kind)).toEqual([
      "context",
      "observation",
    ]);
    expect(JSON.stringify([backup, collision])).toBe(before);
  });
  it("retains the earliest save when merging matching contexts and earlier valid evidence", () => {
    const recent = structuredClone(backup);
    recent.saved[0].savedAt = "2026-10-20T12:00:00.000Z";
    expect(
      previewLearningRestore(recent, backup).merged?.saved[0].savedAt,
    ).toBe(backup.saved[0].savedAt);
  });
  it("rejects malformed versions and cross-sense evidence before any write", () => {
    expect(() =>
      previewLearningRestore(emptyState(), { ...backup, version: 99 }),
    ).toThrow();
    const corrupt = structuredClone(backup);
    corrupt.evidence[0].senseId = "other";
    expect(() => previewLearningRestore(emptyState(), corrupt)).toThrow();
  });
  it("publishes restored state only after the repository accepts a non-stale write", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    } as Storage;
    const session = new LearningSession(
      new BrowserLearningRepository(storage),
      { now: () => "2026-10-23T00:00:00.000Z", createId: () => "event" },
    );
    session.load();
    entries.set("lexis.learning.v1", JSON.stringify(backup));
    expect(() => session.restoreMergedState(backup)).toThrow(/another tab/);
    expect(session.state).toEqual(emptyState());
    session.load();
    expect(session.restoreMergedState(backup)).toEqual(backup);
  });
});
