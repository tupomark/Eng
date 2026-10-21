import {
  RATINGS,
  SKILLS,
  type Evidence,
  type LearningState,
  type Rating,
  type SavedSense,
  type Skill,
} from "./types";

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  path: string,
  max: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > max
  )
    throw new Error(
      `${path} must be ${allowEmpty ? "a" : "a non-empty"} string of at most ${max} characters.`,
    );
  return value;
}

function date(value: unknown, path: string): string {
  const valueText = text(value, path, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(valueText) ||
    !Number.isFinite(Date.parse(valueText))
  )
    throw new Error(`${path} must be a valid UTC ISO timestamp.`);
  const normalized = new Date(valueText).toISOString();
  // Date.parse silently normalizes invalid days such as 30 February.
  if (normalized.slice(0, 19) !== valueText.slice(0, 19))
    throw new Error(`${path} contains an invalid calendar date.`);
  return normalized;
}

function list(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${path} must be an array with at most ${max} items.`);
  return value;
}

/** Treat persisted/browser/imported values as untrusted; return a clean typed value. */
export function parseLearningState(input: unknown): LearningState {
  const state = record(input, "Learning data");
  if (state.version !== 1)
    throw new Error(
      "Unsupported learning data version. Export your data before resetting it.",
    );
  if (
    typeof state.readerProgress !== "number" ||
    !Number.isFinite(state.readerProgress) ||
    state.readerProgress < 0 ||
    state.readerProgress > 100
  )
    throw new Error("Reader progress must be between 0 and 100.");
  const senseIds = new Set<string>();
  const saved: SavedSense[] = list(state.saved, "Saved meanings", 10_000).map(
    (value, index) => {
      const item = record(value, `Saved meaning ${index}`);
      const senseId = text(item.senseId, "Sense ID", 200);
      if (senseIds.has(senseId))
        throw new Error("Saved meanings contain a duplicate sense ID.");
      senseIds.add(senseId);
      return {
        senseId,
        context: text(item.context, "Context", 1_000, true),
        savedAt: date(item.savedAt, "Saved timestamp"),
      };
    },
  );
  const savedAtBySense = new Map(
    saved.map((item) => [item.senseId, item.savedAt]),
  );
  const eventIds = new Set<string>();
  const evidence: Evidence[] = list(
    state.evidence,
    "Learning evidence",
    100_000,
  ).map((value, index) => {
    const item = record(value, `Learning observation ${index}`);
    const id = text(item.id, "Observation ID", 200);
    if (eventIds.has(id))
      throw new Error("Learning evidence contains a duplicate event ID.");
    eventIds.add(id);
    const senseId = text(item.senseId, "Observation sense ID", 200);
    if (!senseIds.has(senseId))
      throw new Error("A learning observation references an unsaved meaning.");
    if (!SKILLS.includes(item.skill as Skill))
      throw new Error("A learning observation contains an unknown skill.");
    if (!RATINGS.includes(item.rating as Rating))
      throw new Error("A learning observation contains an unknown rating.");
    if (item.source !== "self-review")
      throw new Error("A learning observation contains an unsupported source.");
    if (item.skill !== "recognition")
      throw new Error(
        "Self-review currently supports recognition only. Other skills require their own exercises.",
      );
    const occurredAt = date(item.occurredAt, "Observation timestamp");
    if (Date.parse(occurredAt) < Date.parse(savedAtBySense.get(senseId)!))
      throw new Error(
        "A learning observation cannot predate saving its meaning.",
      );
    const disputedAt =
      item.disputedAt === undefined
        ? undefined
        : date(item.disputedAt, "Dispute timestamp");
    if (disputedAt && Date.parse(disputedAt) < Date.parse(occurredAt))
      throw new Error("A dispute cannot predate its observation.");
    return {
      id,
      senseId,
      skill: item.skill as Skill,
      rating: item.rating as Rating,
      occurredAt,
      source: "self-review",
      ...(disputedAt ? { disputedAt } : {}),
    };
  });
  return { version: 1, saved, evidence, readerProgress: state.readerProgress };
}
