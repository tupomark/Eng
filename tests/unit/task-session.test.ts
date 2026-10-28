import { describe, expect, it } from "vitest";
import {
  TaskSession,
  taskSchedules,
  legacyScheduleExclusions,
} from "../../src/application/task-session";
import {
  emptyState,
  saveSense,
  reviewSense,
  disputeEvidence,
} from "../../src/domain";
import {
  taskObservations,
  parseTaskLearningState,
} from "../../src/domain/tasks/state";
import {
  summarizeTaskObservations,
  type TaskDefinition,
} from "../../src/domain/tasks";
import {
  BrowserTaskRepository,
  TASK_STORAGE_KEY,
} from "../../src/infrastructure/storage/browser-task-repository";

const NOW = "2026-10-23T12:00:00.000Z";
const task: TaskDefinition = {
  id: "grammar-perfect",
  version: "1",
  target: { kind: "grammar", conceptId: "present-perfect" },
  skill: "grammar",
  format: "grammar-choice",
  promptFamily: "grammar-recall",
  prompt: "I ___ finished.",
  acceptedAnswers: ["have"],
  explanation: "I takes have in the present perfect.",
  rubricVersion: "grammar-closed-v1",
  evaluator: "deterministic",
  hints: [{ id: "auxiliary", text: "Use the present perfect auxiliary." }],
  source: {
    provider: "LEXIS editorial",
    version: "fixture-v1",
    rights: "Original authored fixture",
    kind: "editorial",
  },
};
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrite = false;
  get length() {
    return this.values.size;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("QuotaExceededError");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
}
function create(storage = new MemoryStorage()) {
  let id = 0;
  let now = NOW;
  const session = new TaskSession(new BrowserTaskRepository(storage), {
    now: () => now,
    createId: () => `event-${++id}`,
  });
  session.load();
  return {
    session,
    storage,
    setNow: (value: string) => {
      now = value;
    },
  };
}

describe("durable shared task session", () => {
  it("autosaves an unfinished answer without submitting, grading or creating evidence", () => {
    const { session, storage } = create();
    const attempt = session.startTask(task);
    session.saveAnswer(attempt.id, "ha");
    const reopened = create(storage).session;
    expect(reopened.state?.attempts[0]).toMatchObject({
      answer: "ha",
      status: "answering",
    });
    expect(taskObservations(reopened.state!)).toEqual([]);
    expect(reopened.state?.scheduleEvents).toEqual([]);
    reopened.saveAnswer(attempt.id, "");
    expect(reopened.state?.attempts[0]?.answer).toBe("");
    expect(() => reopened.saveAnswer(attempt.id, "x".repeat(8_001))).toThrow(
      "8",
    );
    reopened.submitTask(attempt.id, "have");
    expect(() => reopened.saveAnswer(attempt.id, "has")).toThrow("submitted");
  });

  it("starts once, resumes on reopen, and does not manufacture a learning observation", () => {
    const { session, storage } = create();
    const attempt = session.startTask(task);
    expect(session.startTask(task)).toEqual(attempt);
    const reopened = create(storage).session;
    expect(reopened.state?.attempts).toHaveLength(1);
    expect(reopened.startTask(task)).toEqual(attempt);
    expect(taskObservations(reopened.state!)).toEqual([]);
    expect(reopened.state?.reviewItems[0]?.target).toEqual(task.target);
  });

  it("stores the final result exactly once and recovers the same feedback", () => {
    const { session, storage } = create();
    const attempt = session.startTask(task);
    expect(session.submitTask(attempt.id, "have").evaluation?.outcome).toBe(
      "accepted",
    );
    const bytes = storage.getItem(TASK_STORAGE_KEY);
    expect(session.submitTask(attempt.id, "have").status).toBe("evaluated");
    expect(storage.getItem(TASK_STORAGE_KEY)).toBe(bytes);
    expect(taskObservations(create(storage).session.state!)).toHaveLength(1);
    expect(() => session.submitTask(attempt.id, "has")).toThrow(
      "another answer",
    );
  });

  it("retains help and transcript provenance across persistence", () => {
    const { session, storage } = create();
    const attempt = session.startTask(task);
    session.revealHelp(attempt.id, { kind: "hint", hintId: "auxiliary" });
    session.submitTask(attempt.id, "have");
    expect(taskObservations(create(storage).session.state!)[0]).toMatchObject({
      independent: false,
      assistance: { hintIds: ["auxiliary"] },
    });
  });

  it("does not turn provider absence into a negative assessment or schedule rating", () => {
    const { session } = create();
    const open: TaskDefinition = {
      ...task,
      id: "own-sentence",
      target: { kind: "sense", senseId: "linger-stay" },
      skill: "writing",
      format: "own-sentence",
      evaluator: "semantic",
      acceptedAnswers: [],
    };
    const attempt = session.startTask(open);
    expect(
      session.submitTask(attempt.id, "I lingered by the window.").evaluation
        ?.outcome,
    ).toBe("uncertain");
    expect(taskObservations(session.state!)).toEqual([]);
    expect(() =>
      session.recordRating(
        session.state!.reviewItems[0]!.id,
        "again",
        attempt.id,
      ),
    ).toThrow("unassessed");
    expect(session.state?.scheduleEvents).toEqual([]);
  });

  it("keeps the last good snapshot and publishes no success after a denied write", () => {
    const { session, storage } = create();
    const attempt = session.startTask(task);
    const before = storage.getItem(TASK_STORAGE_KEY);
    storage.failWrite = true;
    expect(() => session.submitTask(attempt.id, "have")).toThrow(
      "QuotaExceeded",
    );
    expect(session.state?.attempts[0]?.status).toBe("answering");
    expect(storage.getItem(TASK_STORAGE_KEY)).toBe(before);
    storage.failWrite = false;
    session.submitTask(attempt.id, "have");
    expect(taskObservations(session.state!)).toHaveLength(1);
  });

  it("preserves corrupt bytes and blocks changes after failed reload", () => {
    const { session, storage } = create();
    session.startTask(task);
    storage.setItem(TASK_STORAGE_KEY, "{broken");
    expect(() => session.load()).toThrow();
    expect(() => session.startTask({ ...task, id: "new" })).toThrow(
      "Unreadable",
    );
    expect(storage.getItem(TASK_STORAGE_KEY)).toBe("{broken");
    expect(session.state?.attempts).toHaveLength(1);
  });

  it("detects a stale tab without overwriting another tab's task", () => {
    const { session, storage } = create();
    const second = create(storage).session;
    session.startTask(task);
    const bytes = storage.getItem(TASK_STORAGE_KEY);
    expect(() => second.startTask({ ...task, id: "another" })).toThrow(
      "another tab",
    );
    expect(storage.getItem(TASK_STORAGE_KEY)).toBe(bytes);
    second.load();
    expect(second.state?.attempts).toHaveLength(1);
  });

  it("records an explicit user FSRS rating, deduplicates delivery and reconciles a later challenge", () => {
    const { session, setNow } = create();
    const attempt = session.startTask(task);
    session.submitTask(attempt.id, "has");
    const itemId = session.state!.reviewItems[0]!.id;
    session.recordRating(itemId, "again", attempt.id);
    setNow("2026-10-23T12:01:00.000Z");
    session.recordRating(itemId, "again", attempt.id);
    expect(session.state?.scheduleEvents).toHaveLength(1);
    expect(taskSchedules(session.state!)[0]?.card.reps).toBe(1);
    session.challenge(
      `observation:${attempt.id}`,
      "The prompt did not include enough context.",
    );
    expect(taskSchedules(session.state!)[0]?.card.reps).toBe(0);
    expect(session.state?.scheduleEvents).toHaveLength(1);
    expect(session.state?.attempts[0]?.evaluation?.outcome).toBe("not-yet");
    expect(
      summarizeTaskObservations(
        task.target,
        "grammar",
        taskObservations(session.state!),
        session.state!.challenges,
      ),
    ).toMatchObject({
      observations: 0,
      notYet: 0,
      status: "insufficient-data",
    });
    session.challenge(`observation:${attempt.id}`, "Retry");
    expect(session.state?.challenges).toHaveLength(1);
  });

  it("archives a review objective without deleting observations or schedule history", () => {
    const { session } = create();
    const attempt = session.startTask(task);
    session.submitTask(attempt.id, "have");
    const itemId = session.state!.reviewItems[0]!.id;
    session.recordRating(itemId, "good", attempt.id);
    session.archive(itemId, true);
    expect(taskObservations(session.state!)).toHaveLength(1);
    expect(session.state?.scheduleEvents).toHaveLength(1);
    expect(() => session.recordRating(itemId, "again")).toThrow("archived");
    session.archive(itemId, false);
    expect(session.state?.archivedItemIds).toEqual([]);
  });

  it("previews and imports legacy data with backup, stable IDs and idempotent retry", () => {
    const { session, storage } = create();
    const legacy = reviewSense(
      saveSense(
        emptyState(),
        "old-sense-unavailable",
        "Old context",
        "2026-10-21T12:00:00.000Z",
      ),
      "old-sense-unavailable",
      "good",
      "2026-10-21T12:00:00.000Z",
      "legacy-not-uuid",
    );
    const legacyBytes = JSON.stringify(legacy);
    storage.setItem("lexis.learning.v1", legacyBytes);
    const preview = session.previewLegacy(legacy);
    expect(storage.getItem(TASK_STORAGE_KEY)).toBeNull();
    session.importLegacy(preview);
    expect(storage.getItem("lexis.learning.v1")).toBe(legacyBytes);
    expect(session.state?.legacyBackups[0]?.state).toEqual(legacy);
    expect(session.state?.scheduleEvents[0]).toMatchObject({
      id: "legacy:legacy-not-uuid",
      legacyEventId: "legacy-not-uuid",
      source: "legacy-self-rating",
    });
    const bytes = storage.getItem(TASK_STORAGE_KEY);
    session.importLegacy(preview);
    expect(storage.getItem(TASK_STORAGE_KEY)).toBe(bytes);
    const changed = disputeEvidence(legacy, "legacy-not-uuid", NOW);
    session.importLegacy(session.previewLegacy(changed));
    expect(session.state?.scheduleEvents).toHaveLength(1);
    expect(session.state?.legacyBackups).toHaveLength(2);
    expect(taskSchedules(session.state!)[0]?.card.reps).toBe(0);
  });

  it("reconciles a late legacy challenge through later FSRS events without importing unrelated new reviews", () => {
    const { session, setNow } = create();
    const old = reviewSense(
      reviewSense(
        saveSense(
          emptyState(),
          "old-sense",
          "Old context",
          "2026-10-20T12:00:00.000Z",
        ),
        "old-sense",
        "easy",
        "2026-10-20T12:00:00.000Z",
        "first",
      ),
      "old-sense",
      "hard",
      "2026-10-22T12:00:00.000Z",
      "second",
    );
    session.importLegacy(session.previewLegacy(old));
    const itemId = session.state!.reviewItems[0]!.id;
    session.recordRating(itemId, "good", undefined, "native-later");
    setNow("2026-10-25T12:00:00.000Z");
    const challenged = disputeEvidence(
      old,
      "first",
      "2026-10-24T12:00:00.000Z",
    );
    const alsoNew = reviewSense(
      challenged,
      "old-sense",
      "again",
      "2026-10-25T12:00:00.000Z",
      "not-imported",
    );
    const pending = legacyScheduleExclusions(session.state!, alsoNew);
    expect(pending).toEqual([
      { eventId: "legacy:first", excludedAt: "2026-10-24T12:00:00.000Z" },
    ]);
    const immediate = taskSchedules(session.state!, pending)[0];
    expect(immediate?.card.reps).toBe(2);
    session.reconcileLegacyDisputes(alsoNew);
    expect(taskSchedules(session.state!)[0]?.card).toEqual(immediate?.card);
    expect(session.state?.scheduleEvents).toHaveLength(3);
    expect(
      session.state?.scheduleEvents.some(
        (event) => event.id === "legacy:not-imported",
      ),
    ).toBe(false);
    const before = session.state;
    expect(session.reconcileLegacyDisputes(alsoNew)).toBe(before);
    expect(session.reconcileLegacyDisputes(old)).toBe(before);
  });

  it("restores an export through preview, preserves both histories and rejects conflicting revisions", () => {
    const source = create();
    const attempt = source.session.startTask(task);
    source.session.submitTask(attempt.id, "have");
    const backup = source.storage.getItem(TASK_STORAGE_KEY)!;
    const destination = create();
    const preview = destination.session.previewRestore(backup);
    expect(preview.counts).toEqual({
      tasks: 1,
      attempts: 1,
      reviews: 0,
      challenges: 0,
    });
    expect(destination.session.state?.attempts).toEqual([]);
    destination.session.confirmRestore(preview);
    expect(taskObservations(destination.session.state!)).toEqual(
      taskObservations(source.session.state!),
    );
    const conflict = JSON.parse(backup);
    conflict.tasks[0].prompt = "A conflicting task revision";
    expect(() =>
      destination.session.previewRestore(JSON.stringify(conflict)),
    ).toThrow("conflicting revisions");
    expect(destination.session.state?.tasks[0]?.prompt).toBe(task.prompt);
  });

  it("rejects corrupt import references, incompatible versions and forged assistance", () => {
    const { session } = create();
    const attempt = session.startTask(task);
    const state = JSON.parse(JSON.stringify(session.state));
    state.attempts[0].taskId = "unknown";
    expect(() => parseTaskLearningState(state)).toThrow("unavailable task");
    expect(() =>
      parseTaskLearningState({ ...session.state, schedulerVersion: "future" }),
    ).toThrow("Unsupported");
    expect(() =>
      parseTaskLearningState({
        ...session.state,
        attempts: [
          {
            ...attempt,
            assistance: { hintIds: ["unknown"], acceptedCorrection: false },
          },
        ],
      }),
    ).toThrow("unknown hint");
    expect(() => session.previewRestore("not JSON")).toThrow();
    expect(() => session.previewRestore("x".repeat(10_000_001))).toThrow(
      "10 MB",
    );
  });
});
