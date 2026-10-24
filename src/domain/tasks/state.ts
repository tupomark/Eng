import { parseLearningState } from "../validation";
import type { LearningState, Rating } from "../types";
import {
  replayFsrsSchedule,
  type ReviewIdentity,
  type ScheduleEvent,
  type ScheduleExclusion,
  FSRS_SCHEDULER_VERSION,
} from "../scheduling/fsrs";
import {
  assertTaskDefinition,
  finishTask,
  observationFromTask,
  taskTimestamp,
} from "./engine";
import type {
  AssistanceSnapshot,
  LearningTarget,
  TaskAttempt,
  TaskChallenge,
  TaskDefinition,
  TaskEvaluation,
  TaskObservation,
  TaskSkill,
} from "./types";

export interface TaskLearningState {
  version: 1;
  schedulerVersion: typeof FSRS_SCHEDULER_VERSION;
  tasks: TaskDefinition[];
  attempts: TaskAttempt[];
  challenges: TaskChallenge[];
  reviewItems: ReviewIdentity[];
  scheduleEvents: ScheduleEvent[];
  scheduleExclusions: ScheduleExclusion[];
  archivedItemIds: string[];
  /** Explicitly confirmed migration snapshots preserve the entire parsed original. */
  legacyBackups: { id: string; importedAt: string; state: LearningState }[];
}

export function emptyTaskLearningState(): TaskLearningState {
  return {
    version: 1,
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    tasks: [],
    attempts: [],
    challenges: [],
    reviewItems: [],
    scheduleEvents: [],
    scheduleExclusions: [],
    archivedItemIds: [],
    legacyBackups: [],
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Task data must contain objects.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > max
  )
    throw new Error("Task data contains invalid text.");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new Error("Task data contains an invalid flag.");
  return value;
}
function list(value: unknown, maximum = 10_000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error("Task data exceeds the supported collection size.");
  return value;
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length)
    throw new Error("Task data contains duplicate identifiers.");
  return items;
}
function target(value: unknown): LearningTarget {
  const item = record(value);
  if (item.kind === "sense")
    return { kind: "sense", senseId: text(item.senseId) };
  if (item.kind === "grammar")
    return { kind: "grammar", conceptId: text(item.conceptId) };
  throw new Error("Task data has an unknown target.");
}
function assistance(value: unknown): AssistanceSnapshot {
  const item = record(value);
  const hintIds = list(item.hintIds, 20).map((id) => text(id));
  unique(hintIds, (id) => id);
  return {
    hintIds,
    acceptedCorrection: boolean(item.acceptedCorrection),
    ...(item.answerRevealedAt === undefined
      ? {}
      : { answerRevealedAt: taskTimestamp(text(item.answerRevealedAt, 40)) }),
    ...(item.transcriptRevealedAt === undefined
      ? {}
      : {
          transcriptRevealedAt: taskTimestamp(
            text(item.transcriptRevealedAt, 40),
          ),
        }),
  };
}

export function parseTaskDefinition(value: unknown): TaskDefinition {
  const item = record(value);
  const source = record(item.source);
  const result: TaskDefinition = {
    id: text(item.id),
    version: text(item.version),
    target: target(item.target),
    skill: text(item.skill) as TaskSkill,
    format: text(item.format) as TaskDefinition["format"],
    promptFamily: text(item.promptFamily),
    prompt: text(item.prompt, 8_000),
    acceptedAnswers: list(item.acceptedAnswers, 100).map((answer) =>
      text(answer, 4_000),
    ),
    ...(item.partialAnswers === undefined
      ? {}
      : {
          partialAnswers: list(item.partialAnswers, 100).map((answer) =>
            text(answer, 4_000),
          ),
        }),
    ...(item.caseSensitive === undefined
      ? {}
      : { caseSensitive: boolean(item.caseSensitive) }),
    explanation: text(item.explanation, 4_000),
    rubricVersion: text(item.rubricVersion),
    evaluator: text(item.evaluator) as TaskDefinition["evaluator"],
    hints: list(item.hints, 20).map((hint) => {
      const entry = record(hint);
      return { id: text(entry.id), text: text(entry.text, 2_000) };
    }),
    source: {
      provider: text(source.provider, 1_000),
      version: text(source.version, 1_000),
      rights: text(source.rights, 1_000),
      kind: text(source.kind) as TaskDefinition["source"]["kind"],
    },
    ...(item.audioSourceId === undefined
      ? {}
      : { audioSourceId: text(item.audioSourceId) }),
    ...(item.ambiguous === undefined
      ? {}
      : { ambiguous: boolean(item.ambiguous) }),
  };
  if (item.context !== undefined) {
    const context = record(item.context);
    result.context = {
      id: text(context.id),
      excerpt: text(context.excerpt, 2_000, true),
    };
  }
  assertTaskDefinition(result);
  return result;
}

function parseEvaluation(value: unknown): TaskEvaluation {
  const item = record(value);
  if (item.evaluator !== "deterministic" && item.evaluator !== "provider")
    throw new Error("Invalid evaluation source.");
  const result: TaskEvaluation = {
    outcome: text(item.outcome) as TaskEvaluation["outcome"],
    explanation: text(item.explanation, 4_000),
    rubricVersion: text(item.rubricVersion),
    evaluator: item.evaluator,
    ...(item.provider === undefined ? {} : { provider: text(item.provider) }),
    ...(item.model === undefined ? {} : { model: text(item.model) }),
  };
  if (item.reason !== undefined) {
    if (
      ![
        "ambiguous-prompt",
        "evaluator-unavailable",
        "provider-failure",
        "answer-revealed",
      ].includes(text(item.reason))
    )
      throw new Error("Invalid uncertainty reason.");
    result.reason = item.reason as TaskEvaluation["reason"];
  }
  return result;
}

function parseAttempt(
  value: unknown,
  tasks: Map<string, TaskDefinition>,
): TaskAttempt {
  const item = record(value);
  const result: TaskAttempt = {
    id: text(item.id),
    taskId: text(item.taskId),
    taskVersion: text(item.taskVersion),
    answer: text(item.answer, 8_000, true),
    startedAt: taskTimestamp(text(item.startedAt, 40)),
    status: text(item.status) as TaskAttempt["status"],
    assistance: assistance(item.assistance),
    ...(item.submittedAt === undefined
      ? {}
      : { submittedAt: taskTimestamp(text(item.submittedAt, 40)) }),
  };
  const task = tasks.get(`${result.taskId}\0${result.taskVersion}`);
  if (!task)
    throw new Error("An attempt references an unavailable task revision.");
  if (
    !["answering", "submitted", "evaluated", "cancelled"].includes(
      result.status,
    )
  )
    throw new Error("Invalid task attempt status.");
  if (
    result.assistance.hintIds.some(
      (hint) => !task.hints.some((entry) => entry.id === hint),
    )
  )
    throw new Error("An attempt references an unknown hint.");
  for (const time of [
    result.submittedAt,
    result.assistance.answerRevealedAt,
    result.assistance.transcriptRevealedAt,
  ]) {
    if (time && Date.parse(time) < Date.parse(result.startedAt))
      throw new Error("Attempt timestamps are out of order.");
    if (
      time &&
      result.submittedAt &&
      Date.parse(time) > Date.parse(result.submittedAt)
    )
      throw new Error("Help cannot be added after submission.");
  }
  if (
    result.assistance.transcriptRevealedAt &&
    task.format !== "listening-comprehension"
  )
    throw new Error("Transcript assistance belongs to listening tasks.");
  if (
    (result.status === "submitted" || result.status === "evaluated") &&
    (!result.submittedAt || !result.answer.trim())
  )
    throw new Error("Submitted answers need text and a timestamp.");
  if (result.status === "evaluated")
    return finishTask(
      task,
      { ...result, status: "submitted" },
      parseEvaluation(item.evaluation),
    );
  if (item.evaluation !== undefined)
    throw new Error("An incomplete attempt cannot contain a final assessment.");
  return result;
}

export function taskObservations(state: TaskLearningState): TaskObservation[] {
  const tasks = new Map(
    state.tasks.map((task) => [`${task.id}\0${task.version}`, task]),
  );
  return state.attempts.flatMap((attempt) => {
    const task = tasks.get(`${attempt.taskId}\0${attempt.taskVersion}`);
    if (!task) return [];
    const observation = observationFromTask(task, attempt);
    return observation ? [observation] : [];
  });
}

/** Restore/import/browser boundary. Clean reconstruction rejects corrupt bytes without reset. */
export function parseTaskLearningState(value: unknown): TaskLearningState {
  const input = record(value);
  if (input.version !== 1 || input.schedulerVersion !== FSRS_SCHEDULER_VERSION)
    throw new Error(
      "Unsupported task or scheduler data version. Export the original data before updating.",
    );
  const tasks = unique(
    list(input.tasks, 2_000).map(parseTaskDefinition),
    (task) => `${task.id}\0${task.version}`,
  );
  const taskMap = new Map(
    tasks.map((task) => [`${task.id}\0${task.version}`, task]),
  );
  const attempts = unique(
    list(input.attempts, 20_000).map((attempt) =>
      parseAttempt(attempt, taskMap),
    ),
    (attempt) => attempt.id,
  );
  const reviewItems = unique(
    list(input.reviewItems).map((value): ReviewIdentity => {
      const item = record(value);
      return {
        id: text(item.id, 4_096),
        target: target(item.target),
        skill: text(item.skill) as TaskSkill,
        promptFamily: text(item.promptFamily),
        createdAt: taskTimestamp(text(item.createdAt, 40)),
      };
    }),
    (item) => item.id,
  );
  const scheduleEvents = unique(
    list(input.scheduleEvents, 100_000).map((value): ScheduleEvent => {
      const event = record(value);
      const base = {
        id: text(event.id, 240),
        itemId: text(event.itemId, 4_096),
        occurredAt: taskTimestamp(text(event.occurredAt, 40)),
      };
      if (event.kind === "reschedule")
        return {
          ...base,
          kind: "reschedule",
          dueAt: taskTimestamp(text(event.dueAt, 40)),
        };
      if (event.kind !== "rating")
        throw new Error("Invalid schedule event type.");
      return {
        ...base,
        kind: "rating",
        rating: text(event.rating) as Rating,
        source: text(event.source) as "user-rating" | "legacy-self-rating",
        ...(event.legacyEventId === undefined
          ? {}
          : { legacyEventId: text(event.legacyEventId) }),
        ...(event.attemptId === undefined
          ? {}
          : { attemptId: text(event.attemptId) }),
        ...(event.assistance === undefined
          ? {}
          : { assistance: assistance(event.assistance) }),
      };
    }),
    (event) => event.id,
  );
  const scheduleExclusions = unique(
    list(input.scheduleExclusions, 100_000).map((value): ScheduleExclusion => {
      const exclusion = record(value);
      return {
        eventId: text(exclusion.eventId, 240),
        excludedAt: taskTimestamp(text(exclusion.excludedAt, 40)),
      };
    }),
    (exclusion) => exclusion.eventId,
  );
  const byItem = new Map(reviewItems.map((item) => [item.id, item]));
  if (scheduleEvents.some((event) => !byItem.has(event.itemId)))
    throw new Error("A review event references an unavailable review item.");
  const allEventIds = new Set(scheduleEvents.map((event) => event.id));
  if (
    scheduleExclusions.some((exclusion) => !allEventIds.has(exclusion.eventId))
  )
    throw new Error("An exclusion references an unavailable event.");
  const eventsByItem = new Map<string, ScheduleEvent[]>();
  for (const event of scheduleEvents) {
    const existing = eventsByItem.get(event.itemId) ?? [];
    existing.push(event);
    eventsByItem.set(event.itemId, existing);
  }
  const exclusionsByEvent = new Map(
    scheduleExclusions.map((exclusion) => [exclusion.eventId, exclusion]),
  );
  for (const item of reviewItems) {
    const events = eventsByItem.get(item.id) ?? [];
    replayFsrsSchedule(
      item,
      events,
      events.flatMap((event) => {
        const excluded = exclusionsByEvent.get(event.id);
        return excluded ? [excluded] : [];
      }),
    );
  }
  const archivedItemIds = unique(
    list(input.archivedItemIds).map((id) => text(id, 4_096)),
    (id) => id,
  );
  if (archivedItemIds.some((id) => !byItem.has(id)))
    throw new Error("An archived review item is unavailable.");
  const legacyBackups = unique(
    list(input.legacyBackups, 10).map((value) => {
      const item = record(value);
      return {
        id: text(item.id),
        importedAt: taskTimestamp(text(item.importedAt, 40)),
        state: parseLearningState(item.state),
      };
    }),
    (backup) => backup.id,
  );
  const state = {
    version: 1 as const,
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    tasks,
    attempts,
    challenges: [] as TaskChallenge[],
    reviewItems,
    scheduleEvents,
    scheduleExclusions,
    archivedItemIds,
    legacyBackups,
  };
  const observations = new Map(
    taskObservations(state).map((observation) => [observation.id, observation]),
  );
  state.challenges = unique(
    list(input.challenges, 20_000).map((value) => {
      const challenge = record(value);
      const result = {
        id: text(challenge.id),
        observationId: text(challenge.observationId, 240),
        challengedAt: taskTimestamp(text(challenge.challengedAt, 40)),
        reason: text(challenge.reason, 1_000),
      };
      const observation = observations.get(result.observationId);
      if (!observation)
        throw new Error("A challenge references an unavailable observation.");
      if (Date.parse(result.challengedAt) < Date.parse(observation.occurredAt))
        throw new Error("A challenge cannot predate its observation.");
      return result;
    }),
    (challenge) => challenge.id,
  );
  // One exclusion per observation suffices; originals stay in attempts.
  unique(state.challenges, (challenge) => challenge.observationId);
  return state;
}
