import { describe, expect, it, vi } from "vitest";
import { LearningSession } from "../../src/application/learning-session";
import type {
  LearningSnapshot,
  SnapshotLearningRepository,
} from "../../src/application/ports";
import {
  deriveProgress,
  emptyState,
  parseLearningState,
  saveSense,
  type LearningState,
} from "../../src/domain";

const NOW = "2026-10-22T12:00:00.000Z";
const LATER = "2026-10-22T13:00:00.000Z";

/** A controllable implementation of the local persistence contract. */
class SnapshotRepository implements SnapshotLearningRepository {
  serialized: string | null = null;
  failWrites = false;
  commitCount = 0;

  read(): LearningSnapshot {
    return {
      state:
        this.serialized === null
          ? emptyState()
          : parseLearningState(JSON.parse(this.serialized)),
      serialized: this.serialized,
    };
  }

  commit(state: LearningState, expectedSerialized: string | null): string {
    this.commitCount += 1;
    if (expectedSerialized !== this.serialized)
      throw new Error("Learning changed in another tab.");
    if (this.failWrites) throw new Error("Storage quota exceeded.");
    const serialized = JSON.stringify(parseLearningState(state));
    this.serialized = serialized;
    return serialized;
  }
}

function setup() {
  const repository = new SnapshotRepository();
  const now = vi.fn(() => NOW);
  const createId = vi.fn(() => "generated-event-1");
  const session = new LearningSession(repository, { now, createId });
  return { repository, session, now, createId };
}

describe("local learning application session", () => {
  it("requires a successful load before accepting any mutations", () => {
    const { repository, session, now, createId } = setup();
    expect(session.state).toBeUndefined();
    expect(() => session.saveMeaning("linger-stay", "A context.")).toThrow(
      "Open or reload",
    );
    expect(() => session.recordReview("linger-stay", "good")).toThrow(
      "Open or reload",
    );
    expect(() => session.undoSave("linger-stay")).toThrow("Open or reload");
    expect(repository.serialized).toBeNull();
    expect(repository.commitCount).toBe(0);
    expect(now).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
  });

  it("loads existing version-one data and saves a meaning without adding mastery", () => {
    const { repository, session } = setup();
    repository.serialized = JSON.stringify({
      ...emptyState(),
      readerProgress: 33,
    });
    expect(session.load().readerProgress).toBe(33);
    const saved = session.saveMeaning(
      "linger-stay",
      "Some mornings invite us to linger.",
    );
    expect(session.state).toBe(saved);
    expect(repository.read().state).toEqual(saved);
    expect(saved.version).toBe(1);
    expect(saved.saved[0]).toEqual({
      senseId: "linger-stay",
      context: "Some mornings invite us to linger.",
      savedAt: NOW,
    });
    expect(saved.evidence).toEqual([]);
    expect(
      deriveProgress(saved).every(
        (row) => row.attempts === 0 && row.score === 0,
      ),
    ).toBe(true);
    expect(
      session.saveMeaning("linger-stay", "Another encounter.").saved,
    ).toEqual(saved.saved);
  });

  it("uses injected time and IDs and accepts an explicit retry ID without duplication", () => {
    const { session, now, createId } = setup();
    session.load();
    session.saveMeaning("linger-stay", "Some mornings invite us to linger.");
    now.mockReturnValue(LATER);
    const reviewed = session.recordReview("linger-stay", "good");
    expect(reviewed.evidence[0]).toMatchObject({
      id: "generated-event-1",
      skill: "recognition",
      occurredAt: LATER,
    });
    expect(createId).toHaveBeenCalledTimes(1);
    expect(
      session.recordReview("linger-stay", "good", "generated-event-1").evidence,
    ).toHaveLength(1);
    expect(createId).toHaveBeenCalledTimes(1);
    expect(
      deriveProgress(reviewed)
        .filter((row) => row.skill !== "recognition")
        .every((row) => row.attempts === 0),
    ).toBe(true);
  });

  it("reconciles a dispute while retaining its original observation", () => {
    const { session, now } = setup();
    session.load();
    session.saveMeaning("linger-stay", "A context.");
    session.recordReview("linger-stay", "good", "review-1");
    now.mockReturnValue(LATER);
    const disputed = session.dispute("review-1");
    expect(disputed.evidence).toHaveLength(1);
    expect(disputed.evidence[0]?.disputedAt).toBe(LATER);
    expect(deriveProgress(disputed).every((row) => row.attempts === 0)).toBe(
      true,
    );
  });

  it("bounds reading position and rejects invalid input without publishing it", () => {
    const { repository, session } = setup();
    session.load();
    expect(session.updateReaderProgress(135).readerProgress).toBe(100);
    expect(session.updateReaderProgress(-20).readerProgress).toBe(0);
    const before = session.updateReaderProgress(67);
    const durable = repository.serialized;
    expect(() => session.updateReaderProgress(Number.NaN)).toThrow(
      "finite number",
    );
    expect(() =>
      session.updateReaderProgress(Number.POSITIVE_INFINITY),
    ).toThrow("finite number");
    expect(session.state).toBe(before);
    expect(repository.serialized).toBe(durable);
  });

  it("publishes neither evidence nor a new snapshot when a commit fails, then allows retry", () => {
    const { repository, session } = setup();
    session.load();
    const before = session.saveMeaning("linger-stay", "A context.");
    const durable = repository.serialized;
    repository.failWrites = true;
    expect(() =>
      session.recordReview("linger-stay", "good", "review-1"),
    ).toThrow("quota");
    expect(session.state).toBe(before);
    expect(session.state?.evidence).toEqual([]);
    expect(repository.serialized).toBe(durable);
    repository.failWrites = false;
    expect(
      session.recordReview("linger-stay", "good", "review-1").evidence,
    ).toHaveLength(1);
  });

  it("protects a newer tab snapshot and can explicitly reload it before continuing", () => {
    const { repository, session } = setup();
    const before = session.load();
    const external = saveSense(
      emptyState(),
      "trace-mark",
      "A trace remained.",
      NOW,
    );
    repository.serialized = JSON.stringify(external);
    expect(() => session.saveMeaning("linger-stay", "A context.")).toThrow(
      "another tab",
    );
    expect(session.state).toBe(before);
    expect(repository.read().state).toEqual(external);
    expect(session.load()).toEqual(external);
    expect(
      session
        .saveMeaning("linger-stay", "A context.")
        .saved.map((item) => item.senseId),
    ).toEqual(["trace-mark", "linger-stay"]);
  });

  it("preserves the last good display state and unreadable bytes after a failed reload", () => {
    const { repository, session } = setup();
    session.load();
    const before = session.saveMeaning("linger-stay", "A context.");
    repository.serialized = "{corrupted local learning data";
    expect(() => session.load()).toThrow();
    expect(session.state).toBe(before);
    const commitsBefore = repository.commitCount;
    expect(() => session.saveMeaning("trace-mark", "A context.")).toThrow(
      "kept intact",
    );
    expect(() => session.updateReaderProgress(67)).toThrow("kept intact");
    expect(() => session.undoSave("linger-stay")).toThrow("kept intact");
    expect(repository.commitCount).toBe(commitsBefore);
    expect(repository.serialized).toBe("{corrupted local learning data");
    repository.serialized = JSON.stringify(before);
    expect(session.load()).toEqual(before);
    expect(session.updateReaderProgress(67).readerProgress).toBe(67);
  });

  it("does not manufacture a usable empty snapshot when the initial read fails", () => {
    const { repository, session } = setup();
    repository.serialized = JSON.stringify({ ...emptyState(), version: 999 });
    const unreadable = repository.serialized;
    expect(() => session.load()).toThrow("version");
    expect(session.state).toBeUndefined();
    expect(() => session.saveMeaning("linger-stay", "A context.")).toThrow(
      "Open or reload",
    );
    expect(repository.serialized).toBe(unreadable);
    expect(repository.commitCount).toBe(0);
  });

  it("undoes a fresh save without changing other meanings, reading position or knowledge", () => {
    const { repository, session } = setup();
    session.load();
    session.saveMeaning("linger-stay", "A context.");
    session.saveMeaning("trace-mark", "Another context.");
    session.recordReview("trace-mark", "good", "trace-review");
    const before = session.updateReaderProgress(67);
    const otherProgress = deriveProgress(before).filter(
      (row) => row.senseId === "trace-mark",
    );
    const undone = session.undoSave("linger-stay");
    expect(undone.saved.map((item) => item.senseId)).toEqual(["trace-mark"]);
    expect(undone.readerProgress).toBe(67);
    expect(undone.evidence).toEqual(before.evidence);
    expect(deriveProgress(undone)).toEqual(otherProgress);
    expect(repository.read().state).toEqual(undone);
    expect(session.undoSave("linger-stay")).toEqual(undone);
  });

  it.each([false, true])(
    "refuses to undo a save with evidence, disputed=%s",
    (disputed) => {
      const { repository, session, now } = setup();
      session.load();
      session.saveMeaning("linger-stay", "A context.");
      session.recordReview("linger-stay", "good", "review-1");
      if (disputed) {
        now.mockReturnValue(LATER);
        session.dispute("review-1");
      }
      const before = session.state;
      const durable = repository.serialized;
      expect(() => session.undoSave("linger-stay")).toThrow(
        "practice evidence",
      );
      expect(session.state).toBe(before);
      expect(repository.serialized).toBe(durable);
      expect(session.state?.evidence).toHaveLength(1);
    },
  );

  it("retains the saved association when persisting an undo fails", () => {
    const { repository, session } = setup();
    session.load();
    const before = session.saveMeaning("linger-stay", "A context.");
    repository.failWrites = true;
    expect(() => session.undoSave("linger-stay")).toThrow("quota");
    expect(session.state).toBe(before);
    expect(repository.read().state.saved).toHaveLength(1);
  });
});
