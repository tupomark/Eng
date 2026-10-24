import { describe, expect, it } from "vitest";
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";
import {
  emptyState,
  reviewSense,
  saveSense,
  disputeEvidence,
} from "../../src/domain";
import {
  appendFsrsEvent,
  createReviewIdentity,
  excludeFsrsEvent,
  fsrsItemDue,
  FSRS_PARAMETERS,
  FSRS_SCHEDULER_VERSION,
  previewLegacyFsrsBootstrap,
  replayFsrsSchedule,
  selectFsrsQueue,
  type FsrsRatingEvent,
} from "../../src/domain/scheduling";

const NOW = "2026-10-22T12:00:00.000Z";
const item = () =>
  createReviewIdentity(
    { kind: "sense", senseId: "linger-stay" },
    "recognition",
    "self-recognition",
    NOW,
  );
const event = (
  id = "event-1",
  rating: FsrsRatingEvent["rating"] = "good",
  occurredAt = NOW,
): FsrsRatingEvent => ({
  kind: "rating",
  id,
  itemId: item().id,
  rating,
  occurredAt,
  source: "user-rating",
});

describe("library-backed FSRS scheduling", () => {
  it("uses the exact library with serialized parameters and without changing input", () => {
    const schedule = replayFsrsSchedule(item(), [event()]);
    const actual = fsrs(FSRS_PARAMETERS).next(
      createEmptyCard(NOW),
      NOW,
      Rating.Good,
    );
    expect(schedule.schedulerVersion).toBe(FSRS_SCHEDULER_VERSION);
    expect(schedule.card.due).toBe(actual.card.due.toISOString());
    expect(schedule.card.stability).toBe(actual.card.stability);
    expect(schedule.parameters.enable_fuzz).toBe(false);
    expect(schedule.parameters.w).toHaveLength(21);
    expect(schedule.logs[0]?.log.rating).toBe(Rating.Good);
    expect(JSON.parse(JSON.stringify(schedule))).toEqual(schedule);
    expect(item().createdAt).toBe(NOW);
  });

  it("makes new items due exactly at creation and learning due at the returned instant", () => {
    const fresh = replayFsrsSchedule(item());
    expect(fsrsItemDue(fresh, NOW)).toBe(true);
    const reviewed = appendFsrsEvent(fresh, event("again", "again"));
    expect(reviewed.card.due).toBe("2026-10-22T12:01:00.000Z");
    expect(fsrsItemDue(reviewed, "2026-10-22T12:00:59.999Z")).toBe(false);
    expect(fsrsItemDue(reviewed, "2026-10-22T12:01:00.000Z")).toBe(true);
  });

  it("produces a real lapse after a review-state card is missed", () => {
    const result = replayFsrsSchedule(item(), [
      event("first", "easy"),
      event("second", "again", "2026-11-22T12:00:00.000Z"),
    ]);
    expect(result.card.lapses).toBe(1);
    expect(result.card.due).toBe("2026-11-22T12:10:00.000Z");
  });

  it("deduplicates retries and rejects conflicting reuse", () => {
    const result = replayFsrsSchedule(item(), [event()]);
    expect(appendFsrsEvent(result, event())).toBe(result);
    expect(replayFsrsSchedule(item(), [event(), event()])).toEqual(result);
    expect(() => appendFsrsEvent(result, event("event-1", "easy"))).toThrow(
      "conflicting",
    );
    const reordered: FsrsRatingEvent = {
      source: "user-rating",
      rating: "good",
      occurredAt: NOW,
      itemId: item().id,
      id: "event-1",
      kind: "rating",
    };
    expect(appendFsrsEvent(result, reordered)).toBe(result);
  });

  it("replays canonical event-ID order even when delivery is reversed", () => {
    const first = event("event-a", "good");
    const second = event("event-b", "again");
    expect(replayFsrsSchedule(item(), [second, first])).toEqual(
      replayFsrsSchedule(item(), [first, second]),
    );
  });

  it("replays later events after an early challenge, retaining audit originals", () => {
    const events = [
      event("first", "easy"),
      event("second", "hard", "2026-10-24T12:00:00.000Z"),
      event("third", "good", "2026-10-26T12:00:00.000Z"),
    ];
    const result = excludeFsrsEvent(
      replayFsrsSchedule(item(), events),
      "first",
      "2026-10-27T12:00:00.000Z",
    );
    const expected = replayFsrsSchedule(item(), events.slice(1));
    expect(result.card).toEqual(expected.card);
    expect(result.events).toHaveLength(3);
    expect(result.logs).toHaveLength(2);
    expect(excludeFsrsEvent(result, "first", "2026-10-28T12:00:00.000Z")).toBe(
      result,
    );
  });

  it("manual postponement changes due only and creates no learning observation", () => {
    const before = replayFsrsSchedule(item(), [event()]);
    const after = appendFsrsEvent(before, {
      kind: "reschedule",
      id: "postpone",
      itemId: item().id,
      occurredAt: "2026-10-23T12:00:00.000Z",
      dueAt: "2026-10-30T12:00:00.000Z",
    });
    expect(after.card).toEqual({
      ...before.card,
      due: "2026-10-30T12:00:00.000Z",
    });
    expect(after.logs).toEqual(before.logs);
  });

  it("enforces clock/version/ownership boundaries", () => {
    expect(() =>
      replayFsrsSchedule(item(), [
        event("early", "good", "2026-10-21T12:00:00.000Z"),
      ]),
    ).toThrow("predate");
    expect(() =>
      replayFsrsSchedule(item(), [{ ...event(), itemId: "another" }]),
    ).toThrow("different review");
    expect(() => replayFsrsSchedule(item(), [], [], "future-version")).toThrow(
      "migrate",
    );
    expect(() =>
      replayFsrsSchedule(item(), [], [{ eventId: "missing", excludedAt: NOW }]),
    ).toThrow("unknown");
    expect(() =>
      replayFsrsSchedule(
        item(),
        [event()],
        [{ eventId: "event-1", excludedAt: "2026-10-21T00:00:00.000Z" }],
      ),
    ).toThrow("predate");
  });

  it("keeps absolute UTC facts at day/DST boundaries and caps sibling cards per session", () => {
    const due = replayFsrsSchedule(
      createReviewIdentity(
        { kind: "sense", senseId: "day-boundary" },
        "recall",
        "recall",
        "2026-10-25T00:59:59.000Z",
      ),
    );
    expect(fsrsItemDue(due, "2026-10-25T00:59:58.999Z")).toBe(false);
    expect(fsrsItemDue(due, "2026-10-25T01:00:00.000Z")).toBe(true);
    const first = replayFsrsSchedule(item());
    const sibling = replayFsrsSchedule(
      createReviewIdentity(item().target, "recall", "recall", NOW),
    );
    expect(
      selectFsrsQueue([first, sibling, due], "2026-10-26T00:00:00.000Z", {
        limit: 10,
      }),
    ).toHaveLength(2);
    expect(
      selectFsrsQueue([first, sibling], NOW, {
        limit: 10,
        practicedTargetKeys: ["sense:linger-stay"],
      }),
    ).toEqual([]);
    expect(selectFsrsQueue([first], NOW, { limit: 0 })).toEqual([]);
  });

  it("previews transparent legacy recognition bootstrap without rewriting IDs, disputes or bytes", () => {
    const state = disputeEvidence(
      reviewSense(
        reviewSense(
          saveSense(emptyState(), "linger-stay", "Saved context", NOW),
          "linger-stay",
          "good",
          NOW,
          "not-a-uuid",
        ),
        "linger-stay",
        "easy",
        "2026-10-24T12:00:00.000Z",
        "later:event",
      ),
      "not-a-uuid",
      "2026-10-25T12:00:00.000Z",
    );
    const original = JSON.stringify(state);
    const preview = previewLegacyFsrsBootstrap(state);
    expect(JSON.stringify(state)).toBe(original);
    expect(preview.sourceCounts).toEqual({
      saved: 1,
      evidence: 2,
      disputed: 1,
    });
    expect(
      preview.schedules[0]?.events.map((entry) =>
        entry.kind === "rating" ? entry.legacyEventId : null,
      ),
    ).toEqual(["not-a-uuid", "later:event"]);
    expect(preview.schedules[0]?.exclusions[0]?.eventId).toBe(
      "legacy:not-a-uuid",
    );
    expect(preview.schedules[0]?.item.skill).toBe("recognition");
    expect(preview.schedules[0]?.card.reps).toBe(1);
    expect(previewLegacyFsrsBootstrap(state)).toEqual(preview);
    const maximumLength = reviewSense(
      saveSense(emptyState(), "sense", "context", NOW),
      "sense",
      "good",
      NOW,
      "x".repeat(200),
    );
    expect(
      previewLegacyFsrsBootstrap(maximumLength).schedules[0]?.events[0]?.id,
    ).toHaveLength(207);
  });
});
