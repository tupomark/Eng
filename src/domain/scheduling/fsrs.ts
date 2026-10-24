import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  type Card,
  type FSRSParameters,
  type ReviewLog,
} from "ts-fsrs";
import type { LearningState, Rating } from "../types";
import {
  assertTargetSkill,
  targetKey,
  taskIdentifier,
  sameTaskValue,
  taskTimestamp,
} from "../tasks/engine";
import type {
  AssistanceSnapshot,
  LearningTarget,
  TaskSkill,
} from "../tasks/types";

/** Pin both the shipped library and model; changing this requires an explicit migration. */
export const FSRS_SCHEDULER_VERSION = "ts-fsrs-5.4.2/fsrs-6/lexis-v1" as const;
const defaultParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36_500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});
export const FSRS_PARAMETERS: FSRSParameters = Object.freeze({
  ...defaultParameters,
  w: Object.freeze([...defaultParameters.w]),
  learning_steps: Object.freeze([...defaultParameters.learning_steps]),
  relearning_steps: Object.freeze([...defaultParameters.relearning_steps]),
});

export interface ReviewIdentity {
  id: string;
  target: LearningTarget;
  skill: TaskSkill;
  /** Formats measuring the same objective may explicitly share this history. */
  promptFamily: string;
  createdAt: string;
}

export interface FsrsRatingEvent {
  kind: "rating";
  id: string;
  itemId: string;
  occurredAt: string;
  rating: Rating;
  source: "user-rating" | "legacy-self-rating";
  /** Original v1 identifier is retained even when it is not a UUID. */
  legacyEventId?: string;
  attemptId?: string;
  assistance?: AssistanceSnapshot;
}

export interface RescheduleEvent {
  kind: "reschedule";
  id: string;
  itemId: string;
  occurredAt: string;
  dueAt: string;
}
export type ScheduleEvent = FsrsRatingEvent | RescheduleEvent;

export interface ScheduleExclusion {
  eventId: string;
  excludedAt: string;
}

export interface SerializedFsrsCard extends Omit<Card, "due" | "last_review"> {
  due: string;
  last_review?: string;
}
export interface SerializedFsrsLog extends Omit<ReviewLog, "due" | "review"> {
  due: string;
  review: string;
}
export interface FsrsSchedule {
  item: ReviewIdentity;
  schedulerVersion: typeof FSRS_SCHEDULER_VERSION;
  parameters: FSRSParameters;
  card: SerializedFsrsCard;
  logs: { eventId: string; log: SerializedFsrsLog }[];
  /** Events and exclusions are retained separately from the rebuildable projection. */
  events: ScheduleEvent[];
  exclusions: ScheduleExclusion[];
}

const RATING_MAP = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
} as const;

function cloneParameters(): FSRSParameters {
  return {
    ...FSRS_PARAMETERS,
    w: [...FSRS_PARAMETERS.w],
    learning_steps: [...FSRS_PARAMETERS.learning_steps],
    relearning_steps: [...FSRS_PARAMETERS.relearning_steps],
  };
}

export function reviewItemId(
  target: LearningTarget,
  skill: TaskSkill,
  promptFamily: string,
): string {
  assertTargetSkill(target, skill);
  taskIdentifier(promptFamily, "Prompt family");
  return `review:v1:${encodeURIComponent(targetKey(target))}:${skill}:${encodeURIComponent(promptFamily)}`;
}

export function createReviewIdentity(
  target: LearningTarget,
  skill: TaskSkill,
  promptFamily: string,
  createdAt: string,
): ReviewIdentity {
  return {
    id: reviewItemId(target, skill, promptFamily),
    target: { ...target },
    skill,
    promptFamily,
    createdAt: taskTimestamp(createdAt),
  };
}

function serializeCard(card: Card): SerializedFsrsCard {
  const { due, last_review, ...memory } = card;
  return {
    ...memory,
    due: due.toISOString(),
    ...(last_review ? { last_review: last_review.toISOString() } : {}),
  };
}

function serializeLog(log: ReviewLog): SerializedFsrsLog {
  return {
    ...log,
    due: log.due.toISOString(),
    review: log.review.toISOString(),
  };
}

function validateIdentity(item: ReviewIdentity): void {
  if (item.id !== reviewItemId(item.target, item.skill, item.promptFamily))
    throw new Error(
      "Review identity does not match its target, skill and prompt family.",
    );
  taskTimestamp(item.createdAt);
}

function validateEvent(item: ReviewIdentity, event: ScheduleEvent): void {
  if (typeof event.id !== "string" || !event.id.trim() || event.id.length > 240)
    throw new Error("Schedule event ID must contain 1–240 characters.");
  if (event.itemId !== item.id)
    throw new Error("The event belongs to a different review item.");
  const time = Date.parse(taskTimestamp(event.occurredAt));
  if (time < Date.parse(item.createdAt))
    throw new Error(
      "A review event cannot predate its item. Check this device's clock.",
    );
  if (event.kind === "rating") {
    if (!Object.hasOwn(RATING_MAP, event.rating))
      throw new Error("Unknown FSRS rating.");
    if (event.source !== "user-rating" && event.source !== "legacy-self-rating")
      throw new Error("A schedule requires an explicit user rating.");
    if (event.source === "legacy-self-rating") {
      taskIdentifier(event.legacyEventId!, "Legacy event ID");
      if (
        item.skill !== "recognition" ||
        item.promptFamily !== "self-recognition"
      )
        throw new Error("Legacy self-ratings may bootstrap recognition only.");
    }
  } else if (event.kind === "reschedule") {
    if (Date.parse(taskTimestamp(event.dueAt)) < time)
      throw new Error("A manual postponement cannot set a past due time.");
  } else {
    throw new Error("Unknown schedule event.");
  }
}

/** Full replay makes an early challenge affect every later interval without undo arithmetic. */
export function replayFsrsSchedule(
  item: ReviewIdentity,
  events: readonly ScheduleEvent[] = [],
  exclusions: readonly ScheduleExclusion[] = [],
  version: string = FSRS_SCHEDULER_VERSION,
): FsrsSchedule {
  validateIdentity(item);
  if (version !== FSRS_SCHEDULER_VERSION)
    throw new Error(
      "Unsupported scheduler version. Preserve and migrate the existing schedule before updating.",
    );
  const byId = new Map<string, ScheduleEvent>();
  for (const event of events) {
    validateEvent(item, event);
    const previous = byId.get(event.id);
    if (previous && !sameTaskValue(previous, event))
      throw new Error("This schedule event ID has conflicting contents.");
    byId.set(event.id, event);
  }
  const canonical = [...byId.values()].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const excluded = new Map<string, ScheduleExclusion>();
  for (const exclusion of exclusions) {
    const event = byId.get(exclusion.eventId);
    if (!event)
      throw new Error("An exclusion references an unknown schedule event.");
    if (
      Date.parse(taskTimestamp(exclusion.excludedAt)) <
      Date.parse(event.occurredAt)
    )
      throw new Error("An exclusion cannot predate its review event.");
    const previous = excluded.get(exclusion.eventId);
    if (!previous || exclusion.excludedAt < previous.excludedAt)
      excluded.set(exclusion.eventId, { ...exclusion });
  }
  const scheduler = fsrs(cloneParameters());
  let card = createEmptyCard(item.createdAt);
  const logs: FsrsSchedule["logs"] = [];
  for (const event of canonical) {
    if (excluded.has(event.id)) continue;
    if (event.kind === "reschedule") {
      card = { ...card, due: new Date(event.dueAt) };
      continue;
    }
    const result = scheduler.next(
      card,
      new Date(event.occurredAt),
      RATING_MAP[event.rating],
    );
    card = result.card;
    logs.push({ eventId: event.id, log: serializeLog(result.log) });
  }
  return {
    item: { ...item, target: { ...item.target } },
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    parameters: cloneParameters(),
    card: serializeCard(card),
    logs,
    events: canonical.map((event) => ({ ...event })),
    exclusions: [...excluded.values()],
  };
}

export function appendFsrsEvent(
  schedule: FsrsSchedule,
  event: ScheduleEvent,
): FsrsSchedule {
  const previous = schedule.events.find((entry) => entry.id === event.id);
  if (previous) {
    if (!sameTaskValue(previous, event))
      throw new Error("This schedule event ID has conflicting contents.");
    return schedule;
  }
  return replayFsrsSchedule(
    schedule.item,
    [...schedule.events, event],
    schedule.exclusions,
    schedule.schedulerVersion,
  );
}

export function excludeFsrsEvent(
  schedule: FsrsSchedule,
  eventId: string,
  excludedAt: string,
): FsrsSchedule {
  if (schedule.exclusions.some((exclusion) => exclusion.eventId === eventId))
    return schedule;
  return replayFsrsSchedule(
    schedule.item,
    schedule.events,
    [...schedule.exclusions, { eventId, excludedAt }],
    schedule.schedulerVersion,
  );
}

export function fsrsItemDue(schedule: FsrsSchedule, now: string): boolean {
  return Date.parse(schedule.card.due) <= Date.parse(taskTimestamp(now));
}

/** Same-sense siblings are buried once one is answered in the current session. */
export function selectFsrsQueue(
  schedules: readonly FsrsSchedule[],
  now: string,
  options: {
    limit: number;
    practicedTargetKeys?: readonly string[];
    excludedItemIds?: readonly string[];
  } = { limit: 20 },
): FsrsSchedule[] {
  taskTimestamp(now);
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 0 ||
    options.limit > 500
  )
    throw new Error("The review limit must be between 0 and 500.");
  const practiced = new Set(options.practicedTargetKeys ?? []);
  const excludedItems = new Set(options.excludedItemIds ?? []);
  const queue: FsrsSchedule[] = [];
  for (const schedule of schedules
    .filter(
      (entry) => fsrsItemDue(entry, now) && !excludedItems.has(entry.item.id),
    )
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.card.due) - Date.parse(b.card.due) ||
        (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
    )) {
    const target = targetKey(schedule.item.target);
    if (practiced.has(target)) continue;
    if (queue.length >= options.limit) break;
    queue.push(schedule);
    practiced.add(target);
  }
  return queue;
}

export interface LegacyFsrsBootstrap {
  policy: "recognition-self-rating-bootstrap-v1";
  sourceVersion: "heuristic-v1";
  schedules: FsrsSchedule[];
  sourceCounts: { saved: number; evidence: number; disputed: number };
  /** No legacy bytes, IDs, competence or reader state are overwritten by this preview. */
  explanation: string;
}

export function previewLegacyFsrsBootstrap(
  state: LearningState,
): LegacyFsrsBootstrap {
  const schedules = state.saved.map((saved) => {
    const item = createReviewIdentity(
      { kind: "sense", senseId: saved.senseId },
      "recognition",
      "self-recognition",
      saved.savedAt,
    );
    const legacy = state.evidence.filter(
      (event) => event.senseId === saved.senseId,
    );
    return replayFsrsSchedule(
      item,
      legacy.map((event): FsrsRatingEvent => ({
        kind: "rating",
        id: `legacy:${event.id}`,
        itemId: item.id,
        occurredAt: event.occurredAt,
        rating: event.rating,
        source: "legacy-self-rating",
        legacyEventId: event.id,
      })),
      legacy
        .filter((event) => event.disputedAt)
        .map((event) => ({
          eventId: `legacy:${event.id}`,
          excludedAt: event.disputedAt!,
        })),
    );
  });
  return {
    policy: "recognition-self-rating-bootstrap-v1",
    sourceVersion: "heuristic-v1",
    schedules,
    sourceCounts: {
      saved: state.saved.length,
      evidence: state.evidence.length,
      disputed: state.evidence.filter((event) => event.disputedAt).length,
    },
    explanation:
      "Your original heuristic history is preserved. Explicit self-ratings initialize a separate FSRS recognition schedule; they are not objective evidence and do not measure writing, speaking, listening or pronunciation.",
  };
}
