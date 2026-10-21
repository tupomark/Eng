import { describe, expect, it } from "vitest";
import {
  deriveProgress,
  disputeEvidence,
  dueSenses,
  emptyState,
  parseLearningState,
  reviewSense,
  saveSense,
  SKILLS,
  type LearningState,
} from "../../src/domain";
import {
  findEntry,
  seedEntries,
} from "../../src/infrastructure/dictionary/seed";

const NOW = "2026-10-21T12:00:00.000Z";
const saved = () =>
  saveSense(emptyState(), "linger-stay", "She lingered by the window.", NOW);

describe("sense-based learning", () => {
  it("saves a particular meaning once without claiming knowledge", () => {
    const first = saved();
    expect(saveSense(first, "linger-stay", "A second context", NOW)).toBe(
      first,
    );
    const second = saveSense(first, "linger-remain", "A memory lingered.", NOW);
    expect(second.saved.map((item) => item.senseId)).toEqual([
      "linger-stay",
      "linger-remain",
    ]);
    expect(second.evidence).toEqual([]);
    expect(deriveProgress(second)).toHaveLength(SKILLS.length * 2);
    expect(
      deriveProgress(second).every(
        (item) =>
          item.score === 0 && item.attempts === 0 && item.dueAt === null,
      ),
    ).toBe(true);
    expect(dueSenses(second, NOW)).toEqual(second.saved);
    expect(first.saved).toHaveLength(1);
  });

  it("changes recognition only and keeps the original state immutable", () => {
    const before = saved();
    const after = reviewSense(before, "linger-stay", "good", NOW, "review-1");
    expect(before.evidence).toHaveLength(0);
    const recognition = deriveProgress(after).find(
      (item) => item.skill === "recognition",
    );
    expect(recognition).toMatchObject({
      score: 12,
      attempts: 1,
      intervalDays: 2,
      dueAt: "2026-10-23T12:00:00.000Z",
    });
    expect(
      deriveProgress(after)
        .filter((item) => item.skill !== "recognition")
        .every((item) => item.score === 0 && item.attempts === 0),
    ).toBe(true);
  });

  it("does not share evidence between senses of the same word", () => {
    const both = saveSense(
      saved(),
      "linger-remain",
      "The scent lingered.",
      NOW,
    );
    const after = reviewSense(both, "linger-stay", "easy", NOW, "review-1");
    expect(
      deriveProgress(after)
        .filter((item) => item.senseId === "linger-remain")
        .every((item) => item.attempts === 0),
    ).toBe(true);
    expect(dueSenses(after, NOW).map((item) => item.senseId)).toEqual([
      "linger-remain",
    ]);
  });

  it("treats retrying the same observation as idempotent and rejects conflicting reuse", () => {
    const after = reviewSense(saved(), "linger-stay", "good", NOW, "review-1");
    expect(
      reviewSense(
        after,
        "linger-stay",
        "good",
        "2026-10-22T12:00:00.000Z",
        "review-1",
      ),
    ).toBe(after);
    expect(() =>
      reviewSense(after, "linger-stay", "easy", NOW, "review-1"),
    ).toThrow("different observation");
  });

  it("makes a missed meaning due again after ten minutes, including exact boundary", () => {
    const after = reviewSense(saved(), "linger-stay", "again", NOW, "review-1");
    expect(dueSenses(after, "2026-10-21T12:09:59.999Z")).toEqual([]);
    expect(dueSenses(after, "2026-10-21T12:10:00.000Z")).toHaveLength(1);
    expect(deriveProgress(after)[0]?.score).toBe(0);
  });

  it("schedules later reviews from their actual timestamp", () => {
    const first = reviewSense(saved(), "linger-stay", "good", NOW, "review-1");
    const second = reviewSense(
      first,
      "linger-stay",
      "good",
      "2026-10-24T09:00:00.000Z",
      "review-2",
    );
    expect(deriveProgress(second)[0]).toMatchObject({
      attempts: 2,
      intervalDays: 4,
      dueAt: "2026-10-28T09:00:00.000Z",
    });
  });

  it("replays estimates and schedules after a disputed observation without deleting evidence", () => {
    const first = reviewSense(saved(), "linger-stay", "good", NOW, "review-1");
    const second = reviewSense(
      first,
      "linger-stay",
      "easy",
      "2026-10-23T12:00:00.000Z",
      "review-2",
    );
    const disputed = disputeEvidence(
      second,
      "review-1",
      "2026-10-24T12:00:00.000Z",
    );
    expect(disputed.evidence).toHaveLength(2);
    expect(disputed.evidence[0]?.disputedAt).toBe("2026-10-24T12:00:00.000Z");
    expect(deriveProgress(disputed)[0]).toMatchObject({
      score: 18,
      attempts: 1,
      intervalDays: 4,
      dueAt: "2026-10-27T12:00:00.000Z",
    });
    const allDisputed = disputeEvidence(
      disputed,
      "review-2",
      "2026-10-24T12:00:00.000Z",
    );
    expect(
      deriveProgress(allDisputed).every(
        (item) => item.score === 0 && item.attempts === 0,
      ),
    ).toBe(true);
    expect(dueSenses(allDisputed, NOW)).toHaveLength(1);
    expect(disputeEvidence(allDisputed, "review-1", NOW)).toBe(allDisputed);
  });

  it("rejects invalid review operations rather than inventing progress", () => {
    expect(() =>
      reviewSense(emptyState(), "missing", "good", NOW, "review-1"),
    ).toThrow("Save this meaning");
    expect(() => saveSense(emptyState(), "", "", NOW)).toThrow("Sense ID");
    expect(() =>
      saveSense(emptyState(), "sense", "x".repeat(1_001), NOW),
    ).toThrow("1,000");
    expect(() => saveSense(emptyState(), "sense", "", "invalid")).toThrow(
      "timestamp",
    );
    expect(() => disputeEvidence(saved(), "missing", NOW)).toThrow(
      "could not be found",
    );
    expect(() =>
      reviewSense(
        saved(),
        "linger-stay",
        "good",
        "2026-10-20T12:00:00.000Z",
        "review-1",
      ),
    ).toThrow("cannot predate saving");
  });
});

describe("persisted data boundary", () => {
  it("round trips valid data and returns clean objects", () => {
    const state = reviewSense(saved(), "linger-stay", "hard", NOW, "review-1");
    expect(parseLearningState(JSON.parse(JSON.stringify(state)))).toEqual(
      state,
    );
    expect(parseLearningState({ ...state, unexpected: "discarded" })).toEqual(
      state,
    );
  });

  it("enforces the same bounded context on new and persisted meanings", () => {
    const state = saveSense(
      emptyState(),
      "linger-stay",
      "x".repeat(1_000),
      NOW,
    );
    expect(parseLearningState(state)).toEqual(state);
    expect(() =>
      parseLearningState({
        ...state,
        saved: [{ ...state.saved[0], context: "x".repeat(1_001) }],
      }),
    ).toThrow("1000 characters");
  });

  it.each([
    null,
    [],
    {},
    { ...emptyState(), version: 2 },
    { ...emptyState(), readerProgress: -1 },
    { ...emptyState(), readerProgress: Number.NaN },
    { ...emptyState(), saved: "broken" },
  ])("rejects corrupt/unsupported state %#", (value) => {
    expect(() => parseLearningState(value)).toThrow();
  });

  it("rejects duplicate senses and evidence, orphan evidence and invalid dates", () => {
    const state = reviewSense(saved(), "linger-stay", "good", NOW, "review-1");
    expect(() =>
      parseLearningState({ ...state, saved: [...state.saved, ...state.saved] }),
    ).toThrow("duplicate sense");
    expect(() =>
      parseLearningState({
        ...state,
        evidence: [...state.evidence, ...state.evidence],
      }),
    ).toThrow("duplicate event");
    expect(() => parseLearningState({ ...state, saved: [] })).toThrow(
      "unsaved meaning",
    );
    expect(() =>
      parseLearningState({
        ...state,
        saved: [{ ...state.saved[0], savedAt: "2026-02-30T12:00:00.000Z" }],
      }),
    ).toThrow("calendar date");
    expect(() =>
      parseLearningState({
        ...state,
        evidence: [{ ...state.evidence[0], skill: "fluency" }],
      }),
    ).toThrow("unknown skill");
    expect(() =>
      parseLearningState({
        ...state,
        evidence: [
          { ...state.evidence[0], disputedAt: "2026-10-20T12:00:00.000Z" },
        ],
      }),
    ).toThrow("predate");
    expect(() =>
      parseLearningState({
        ...state,
        evidence: [
          { ...state.evidence[0], occurredAt: "2026-10-20T12:00:00.000Z" },
        ],
      }),
    ).toThrow("cannot predate saving");
  });

  it.each(["context", "recall", "writing", "speaking"])(
    "rejects self-review that claims unsupported %s evidence",
    (skill) => {
      const state = reviewSense(
        saved(),
        "linger-stay",
        "good",
        NOW,
        "review-1",
      );
      expect(() =>
        parseLearningState({
          ...state,
          evidence: [{ ...state.evidence[0], skill }],
        }),
      ).toThrow("recognition only");
    },
  );

  it("replays persisted evidence in timestamp order", () => {
    const first = reviewSense(saved(), "linger-stay", "good", NOW, "review-1");
    const second = reviewSense(
      first,
      "linger-stay",
      "again",
      "2026-10-22T12:00:00.000Z",
      "review-2",
    );
    const reversed: LearningState = {
      ...second,
      evidence: [...second.evidence].reverse(),
    };
    expect(deriveProgress(reversed)).toEqual(deriveProgress(second));
  });

  it("uses event ID order to replay observations sharing a timestamp", () => {
    const first = reviewSense(saved(), "linger-stay", "good", NOW, "event-a");
    const second = reviewSense(first, "linger-stay", "again", NOW, "event-b");
    const reversed: LearningState = {
      ...second,
      evidence: [...second.evidence].reverse(),
    };
    expect(deriveProgress(reversed)).toEqual(deriveProgress(second));
    expect(deriveProgress(reversed)[0]).toMatchObject({
      score: 0,
      attempts: 2,
      dueAt: "2026-10-21T12:10:00.000Z",
    });
  });
});

describe("editorial seed dictionary", () => {
  it("resolves supported inflections and punctuation without pretending to cover unknown words", () => {
    expect(findEntry("‘Lingered,’")?.lexeme.lemma).toBe("linger");
    expect(findEntry("traced")?.lexeme.lemma).toBe("trace");
    expect(findEntry("unknown-word")).toBeUndefined();
    expect(findEntry("a whole sentence")).toBeUndefined();
  });

  it("has globally unique sense IDs linked to the correct lexeme", () => {
    const senses = seedEntries.flatMap((entry) => entry.senses);
    expect(new Set(senses.map((sense) => sense.id)).size).toBe(senses.length);
    expect(
      seedEntries.every((entry) =>
        entry.senses.every((sense) => sense.lexemeId === entry.lexeme.id),
      ),
    ).toBe(true);
    expect(findEntry("linger")?.senses).toHaveLength(2);
    expect(findEntry("trace")?.senses).toHaveLength(2);
  });
});
