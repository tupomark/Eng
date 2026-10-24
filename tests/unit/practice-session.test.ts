import { describe, expect, it } from "vitest";
import {
  parsePracticeSession,
  practiceSessionPolicy,
} from "../../src/domain/tasks/practice-session";
import type { TaskAttempt } from "../../src/domain/tasks";
const session = {
  version: 1 as const,
  revision: 0,
  startedAt: "2026-10-24T12:00:00.000Z",
  attemptIds: ["a", "b"],
  senseId: "linger-stay",
  format: "recall" as const,
};
const attempt = (
  id: string,
  time = "2026-10-24T12:01:00.000Z",
): TaskAttempt => ({
  id,
  taskId: "task",
  taskVersion: "1",
  startedAt: time,
  submittedAt: time,
  status: "evaluated",
  answer: "answer",
  assistance: { hintIds: ["help"], acceptedCorrection: false },
  evaluation: {
    outcome: "uncertain",
    explanation: "Not assessed",
    rubricVersion: "1",
    evaluator: "deterministic",
  },
});
const base = {
  now: "2026-10-24T13:00:00.000Z",
  dailyItems: 20,
  session,
  attempts: [attempt("a"), attempt("b")],
  ratings: [],
};
describe("practice session workload", () => {
  it("bounds Quick and Focused while retaining completed work on mode changes", () => {
    expect(practiceSessionPolicy({ ...base, mode: "quick" })).toMatchObject({
      limit: 5,
      remaining: 3,
      sessionCompleted: 2,
      offersNext: true,
    });
    expect(
      practiceSessionPolicy({ ...base, mode: "focused", dailyItems: 30 }),
    ).toMatchObject({ limit: 20, remaining: 18, sessionCompleted: 2 });
    expect(
      practiceSessionPolicy({ ...base, mode: "quick", dailyItems: 1 }),
    ).toMatchObject({ limit: 1, remaining: 0, canStart: false });
  });
  it("counts time spent on assisted/uncertain answers without creating evidence and deduplicates rating workload", () => {
    const input = structuredClone(base);
    const policy = practiceSessionPolicy({
      ...input,
      mode: "focused",
      ratings: [
        {
          kind: "rating",
          id: "rated:a",
          itemId: "item",
          occurredAt: base.now,
          source: "user-rating",
          rating: "good",
          attemptId: "a",
        },
        {
          kind: "rating",
          id: "self",
          itemId: "self",
          occurredAt: base.now,
          source: "user-rating",
          rating: "again",
        },
      ],
    });
    expect(policy.dailyUsed).toBe(3);
    expect(input).toEqual(base);
  });
  it("keeps Free manual and Goal explicitly unavailable instead of inventing a plan", () => {
    expect(
      practiceSessionPolicy({ ...base, dailyItems: 1, mode: "free" }),
    ).toMatchObject({
      limit: null,
      remaining: null,
      canStart: true,
      offersNext: false,
    });
    expect(practiceSessionPolicy({ ...base, mode: "goal" })).toMatchObject({
      canStart: false,
      offersNext: false,
    });
  });
  it("uses the current local day without resetting the persisted session or changing history", () => {
    expect(
      practiceSessionPolicy({
        ...base,
        mode: "quick",
        now: "2026-10-28T13:00:00.000Z",
      }),
    ).toMatchObject({ dailyUsed: 0, sessionCompleted: 2 });
  });
  it("validates a resumable cursor and refuses corrupt or duplicated session IDs", () => {
    expect(parsePracticeSession(JSON.parse(JSON.stringify(session)))).toEqual(
      session,
    );
    expect(() =>
      parsePracticeSession({ ...session, attemptIds: ["a", "a"] }),
    ).toThrow();
    expect(() =>
      parsePracticeSession({ ...session, format: "invented" }),
    ).toThrow();
  });
});
