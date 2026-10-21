import {
  RATINGS,
  SKILLS,
  type ClockInput,
  type Evidence,
  type LearningState,
  type Rating,
  type SavedSense,
  type SkillProgress,
} from "./types";

/** Intentionally simple and inspectable. This is not FSRS or a retention model. */
export const SCHEDULER_VERSION = "heuristic-v1";
const DAY_MS = 86_400_000;
const SCORE_CHANGE: Record<Rating, number> = {
  again: -25,
  hard: 6,
  good: 12,
  easy: 18,
};

function iso(now: ClockInput): string {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime()))
    throw new Error("A valid learning timestamp is required.");
  return date.toISOString();
}

function identifier(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 200
  ) {
    throw new Error(
      `${label} must be a non-empty identifier of at most 200 characters.`,
    );
  }
}

export function emptyState(): LearningState {
  return { version: 1, saved: [], evidence: [], readerProgress: 0 };
}

export function saveSense(
  state: LearningState,
  senseId: string,
  context: string,
  now: ClockInput,
): LearningState {
  identifier(senseId, "Sense ID");
  if (state.saved.some((saved) => saved.senseId === senseId)) return state;
  if (typeof context !== "string" || context.length > 1_000)
    throw new Error("Context must contain at most 1,000 characters.");
  return {
    ...state,
    saved: [...state.saved, { senseId, context, savedAt: iso(now) }],
  };
}

export function reviewSense(
  state: LearningState,
  senseId: string,
  rating: Rating,
  now: ClockInput,
  eventId: string,
): LearningState {
  identifier(eventId, "Review event ID");
  if (!RATINGS.includes(rating)) throw new Error("Unknown review rating.");
  const previous = state.evidence.find((event) => event.id === eventId);
  if (previous) {
    if (
      previous.senseId !== senseId ||
      previous.rating !== rating ||
      previous.skill !== "recognition"
    ) {
      throw new Error(
        "This review event ID has already been used for a different observation.",
      );
    }
    return state;
  }
  const saved = state.saved.find((item) => item.senseId === senseId);
  if (!saved) throw new Error("Save this meaning before reviewing it.");
  const occurredAt = iso(now);
  if (Date.parse(occurredAt) < Date.parse(saved.savedAt))
    throw new Error(
      "A review cannot predate saving its meaning. Check this device's clock.",
    );
  const evidence: Evidence = {
    id: eventId,
    senseId,
    skill: "recognition",
    rating,
    occurredAt,
    source: "self-review",
  };
  return { ...state, evidence: [...state.evidence, evidence] };
}

export function disputeEvidence(
  state: LearningState,
  evidenceId: string,
  now: ClockInput,
): LearningState {
  const existing = state.evidence.find((event) => event.id === evidenceId);
  if (!existing)
    throw new Error("The learning observation could not be found.");
  if (existing.disputedAt) return state;
  const disputedAt = iso(now);
  if (Date.parse(disputedAt) < Date.parse(existing.occurredAt))
    throw new Error("A dispute cannot predate its observation.");
  return {
    ...state,
    evidence: state.evidence.map((event) =>
      event.id === evidenceId ? { ...event, disputedAt } : event,
    ),
  };
}

function nextInterval(previous: number, rating: Rating): number {
  if (rating === "again") return 10 / (24 * 60);
  if (rating === "hard") return Math.min(365, Math.max(1, previous * 1.2));
  if (rating === "good") return Math.min(365, Math.max(2, previous * 2));
  return Math.min(365, Math.max(4, previous * 2.5));
}

export function deriveProgress(state: LearningState): SkillProgress[] {
  // A canonical ID tie-break keeps replay independent of import or delivery order.
  const active = state.evidence
    .filter((event) => !event.disputedAt)
    .slice()
    .sort((a, b) => {
      const timeDifference =
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
      return timeDifference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  const bySense = new Map<string, Map<SkillProgress["skill"], SkillProgress>>();
  const progress = state.saved.flatMap((saved) => {
    const skills = new Map<SkillProgress["skill"], SkillProgress>();
    bySense.set(saved.senseId, skills);
    return SKILLS.map((skill): SkillProgress => {
      const value: SkillProgress = {
        senseId: saved.senseId,
        skill,
        score: 0,
        attempts: 0,
        dueAt: null,
        intervalDays: 0,
      };
      skills.set(skill, value);
      return value;
    });
  });
  for (const event of active) {
    const value = bySense.get(event.senseId)?.get(event.skill);
    if (!value) continue;
    value.score = Math.max(
      0,
      Math.min(100, value.score + SCORE_CHANGE[event.rating]),
    );
    value.intervalDays = nextInterval(value.intervalDays, event.rating);
    value.dueAt = new Date(
      Date.parse(event.occurredAt) + Math.round(value.intervalDays * DAY_MS),
    ).toISOString();
    value.attempts += 1;
  }
  return progress;
}

export function dueSenses(state: LearningState, now: ClockInput): SavedSense[] {
  const timestamp = Date.parse(iso(now));
  const recognition = new Map(
    deriveProgress(state)
      .filter((progress) => progress.skill === "recognition")
      .map((progress) => [progress.senseId, progress]),
  );
  return state.saved.filter((saved) => {
    const progress = recognition.get(saved.senseId);
    return progress?.dueAt == null || Date.parse(progress.dueAt) <= timestamp;
  });
}
