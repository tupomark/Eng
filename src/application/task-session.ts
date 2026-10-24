import { parseLearningState } from "../domain/validation";
import type { LearningState, Rating } from "../domain/types";
import {
  beginTask,
  saveTaskAnswer,
  evaluateClosedTask,
  finishTask,
  revealTaskHelp,
  submitTask as submitAnswer,
  targetKey,
  taskTimestamp,
  sameTaskValue,
} from "../domain/tasks/engine";
import type {
  LearningTarget,
  TaskAttempt,
  TaskDefinition,
  TaskEvaluation,
} from "../domain/tasks/types";
import {
  emptyTaskLearningState,
  parseTaskDefinition,
  parseTaskLearningState,
  taskObservations,
  type TaskLearningState,
} from "../domain/tasks/state";
import {
  createReviewIdentity,
  previewLegacyFsrsBootstrap,
  replayFsrsSchedule,
  type FsrsRatingEvent,
  type LegacyFsrsBootstrap,
  type ReviewIdentity,
} from "../domain/scheduling/fsrs";

export interface TaskSnapshotRepository {
  read(): { state: TaskLearningState; serialized: string | null };
  commit(state: TaskLearningState, expected: string | null): string;
}
export interface LegacyMigrationPreview {
  source: LearningState;
  sourceBytes: string;
  preview: LegacyFsrsBootstrap;
}
export interface TaskRestorePreview {
  base: string | null;
  candidate: TaskLearningState;
  counts: {
    tasks: number;
    attempts: number;
    reviews: number;
    challenges: number;
  };
}

/** Local-only orchestration. Server persistence uses authenticated commands, not snapshots. */
export class TaskSession {
  private snapshot:
    { state: TaskLearningState; serialized: string | null } | undefined;
  private readable = false;
  constructor(
    private repository: TaskSnapshotRepository,
    private options: { now(): string; createId(): string },
  ) {}
  get state() {
    return this.snapshot?.state;
  }
  load(): TaskLearningState {
    try {
      const snapshot = this.repository.read();
      this.snapshot = {
        state: parseTaskLearningState(snapshot.state),
        serialized: snapshot.serialized,
      };
      this.readable = true;
      return this.snapshot.state;
    } catch (error) {
      this.readable = false;
      throw error;
    }
  }
  private current(): TaskLearningState {
    if (!this.snapshot || !this.readable)
      throw new Error(
        "Reload task data before making changes. Unreadable data has been preserved.",
      );
    return this.snapshot.state;
  }
  private commit(state: TaskLearningState): TaskLearningState {
    this.current();
    const validated = parseTaskLearningState(state);
    const serialized = this.repository.commit(
      validated,
      this.snapshot!.serialized,
    );
    this.snapshot = { state: validated, serialized };
    return validated;
  }
  private findAttempt(id: string): {
    state: TaskLearningState;
    attempt: TaskAttempt;
    task: TaskDefinition;
  } {
    const state = this.current();
    const attempt = state.attempts.find((entry) => entry.id === id);
    const task =
      attempt &&
      state.tasks.find(
        (entry) =>
          entry.id === attempt.taskId && entry.version === attempt.taskVersion,
      );
    if (!attempt || !task)
      throw new Error("This task attempt could not be found.");
    return { state, attempt, task };
  }
  startTask(input: TaskDefinition): TaskAttempt {
    const state = this.current();
    const task = parseTaskDefinition(input);
    const existing = state.tasks.find(
      (entry) => entry.id === task.id && entry.version === task.version,
    );
    if (existing && !sameTaskValue(existing, task))
      throw new Error(
        "This task revision already exists with different content.",
      );
    const pending = state.attempts.find(
      (attempt) =>
        attempt.taskId === task.id &&
        attempt.taskVersion === task.version &&
        (attempt.status === "answering" || attempt.status === "submitted"),
    );
    if (pending) return pending;
    const now = this.options.now();
    const attempt = beginTask(task, this.options.createId(), now);
    const item = createReviewIdentity(
      task.target,
      task.skill,
      task.promptFamily,
      now,
    );
    this.commit({
      ...state,
      tasks: existing ? state.tasks : [...state.tasks, task],
      attempts: [...state.attempts, attempt],
      reviewItems: state.reviewItems.some((entry) => entry.id === item.id)
        ? state.reviewItems
        : [...state.reviewItems, item],
    });
    return this.current().attempts.find((entry) => entry.id === attempt.id)!;
  }
  revealHelp(
    id: string,
    help: { kind: "hint"; hintId: string } | { kind: "answer" | "transcript" },
  ): TaskAttempt {
    const { state, attempt, task } = this.findAttempt(id);
    const next = revealTaskHelp(task, attempt, help, this.options.now());
    if (next !== attempt)
      this.commit({
        ...state,
        attempts: state.attempts.map((entry) =>
          entry.id === id ? next : entry,
        ),
      });
    return next;
  }
  saveAnswer(id: string, answer: string): TaskAttempt {
    const { state, attempt, task } = this.findAttempt(id);
    const next = saveTaskAnswer(task, attempt, answer);
    if (next === attempt) return attempt;
    this.commit({
      ...state,
      attempts: state.attempts.map((entry) => (entry.id === id ? next : entry)),
    });
    return this.current().attempts.find((entry) => entry.id === id)!;
  }
  submitTask(id: string, answer: string): TaskAttempt {
    const { state, attempt, task } = this.findAttempt(id);
    if (attempt.status === "evaluated") {
      if (attempt.answer !== answer)
        throw new Error(
          "This attempt was already submitted with another answer.",
        );
      return attempt;
    }
    const submitted = submitAnswer(task, attempt, answer, this.options.now());
    const evaluated = finishTask(
      task,
      submitted,
      evaluateClosedTask(task, submitted),
    );
    this.commit({
      ...state,
      attempts: state.attempts.map((entry) =>
        entry.id === id ? evaluated : entry,
      ),
    });
    return this.current().attempts.find((entry) => entry.id === id)!;
  }
  /** For a separately verified provider pipeline; no UI may invent provider outcomes. */
  finishProviderTask(id: string, evaluation: TaskEvaluation): TaskAttempt {
    const { state, attempt, task } = this.findAttempt(id);
    const next = finishTask(task, attempt, evaluation);
    this.commit({
      ...state,
      attempts: state.attempts.map((entry) => (entry.id === id ? next : entry)),
    });
    return this.current().attempts.find((entry) => entry.id === id)!;
  }
  challenge(observationId: string, reason: string): TaskLearningState {
    const state = this.current();
    if (
      state.challenges.some(
        (challenge) => challenge.observationId === observationId,
      )
    )
      return state;
    const observation = taskObservations(state).find(
      (entry) => entry.id === observationId,
    );
    if (!observation) throw new Error("This observation could not be found.");
    const challengedAt = taskTimestamp(this.options.now());
    const relatedEvents = state.scheduleEvents.filter(
      (event) =>
        event.kind === "rating" && event.attemptId === observation.attemptId,
    );
    return this.commit({
      ...state,
      challenges: [
        ...state.challenges,
        { id: this.options.createId(), observationId, challengedAt, reason },
      ],
      scheduleExclusions: [
        ...state.scheduleExclusions,
        ...relatedEvents
          .filter(
            (event) =>
              !state.scheduleExclusions.some(
                (entry) => entry.eventId === event.id,
              ),
          )
          .map((event) => ({ eventId: event.id, excludedAt: challengedAt })),
      ],
    });
  }
  recordRating(
    itemId: string,
    rating: Rating,
    attemptId?: string,
    eventId?: string,
  ): TaskLearningState {
    const state = this.current();
    const item = state.reviewItems.find((entry) => entry.id === itemId);
    if (!item) throw new Error("This review item could not be found.");
    if (state.archivedItemIds.includes(itemId))
      throw new Error("Restore this archived item before reviewing it.");
    let attempt: TaskAttempt | undefined;
    if (attemptId) {
      const found = this.findAttempt(attemptId);
      attempt = found.attempt;
      if (
        attempt.status !== "evaluated" ||
        attempt.evaluation?.outcome === "uncertain"
      )
        throw new Error(
          "An unassessed attempt cannot automatically change its schedule.",
        );
      if (
        targetKey(found.task.target) !== targetKey(item.target) ||
        found.task.skill !== item.skill ||
        found.task.promptFamily !== item.promptFamily
      )
        throw new Error("This attempt belongs to another learning objective.");
      if (
        state.challenges.some(
          (entry) => entry.observationId === `observation:${attemptId}`,
        )
      )
        throw new Error(
          "A challenged attempt cannot create a new schedule rating.",
        );
    }
    const id =
      eventId ?? (attemptId ? `rating:${attemptId}` : this.options.createId());
    const previous = state.scheduleEvents.find((entry) => entry.id === id);
    if (previous) {
      if (
        previous.kind === "rating" &&
        previous.itemId === itemId &&
        previous.rating === rating &&
        previous.attemptId === attemptId
      )
        return state;
      throw new Error(
        "This rating ID is already in use for a different answer.",
      );
    }
    const event: FsrsRatingEvent = {
      kind: "rating",
      id,
      itemId,
      occurredAt: taskTimestamp(this.options.now()),
      rating,
      source: "user-rating",
      ...(attempt
        ? {
            attemptId,
            assistance: {
              ...attempt.assistance,
              hintIds: [...attempt.assistance.hintIds],
            },
          }
        : {}),
    };
    return this.commit({
      ...state,
      scheduleEvents: [...state.scheduleEvents, event],
    });
  }
  ensureReviewItem(item: ReviewIdentity): TaskLearningState {
    const state = this.current();
    if (state.reviewItems.some((entry) => entry.id === item.id)) return state;
    return this.commit({ ...state, reviewItems: [...state.reviewItems, item] });
  }
  /** Apply newly recorded legacy challenges only; never import ratings implicitly. */
  reconcileLegacyDisputes(legacy: LearningState): TaskLearningState {
    const state = this.current();
    const exclusions = legacyScheduleExclusions(
      state,
      parseLearningState(legacy),
    );
    if (!exclusions.length) return state;
    return this.commit({
      ...state,
      scheduleExclusions: [...state.scheduleExclusions, ...exclusions],
    });
  }
  postpone(itemId: string, dueAt: string): TaskLearningState {
    const state = this.current();
    return this.commit({
      ...state,
      scheduleEvents: [
        ...state.scheduleEvents,
        {
          kind: "reschedule",
          id: this.options.createId(),
          itemId,
          occurredAt: taskTimestamp(this.options.now()),
          dueAt: taskTimestamp(dueAt),
        },
      ],
    });
  }
  archive(itemId: string, archived: boolean): TaskLearningState {
    const state = this.current();
    return this.commit({
      ...state,
      archivedItemIds: archived
        ? [...new Set([...state.archivedItemIds, itemId])]
        : state.archivedItemIds.filter((id) => id !== itemId),
    });
  }
  previewLegacy(input: LearningState): LegacyMigrationPreview {
    const source = parseLearningState(input);
    return {
      source,
      sourceBytes: JSON.stringify(source),
      preview: previewLegacyFsrsBootstrap(source),
    };
  }
  importLegacy(preview: LegacyMigrationPreview): TaskLearningState {
    const state = this.current();
    if (
      JSON.stringify(parseLearningState(preview.source)) !== preview.sourceBytes
    )
      throw new Error(
        "The migration preview changed. Preview your data again.",
      );
    if (
      state.legacyBackups.some(
        (backup) => JSON.stringify(backup.state) === preview.sourceBytes,
      )
    )
      return state;
    const checked = previewLegacyFsrsBootstrap(preview.source);
    const now = taskTimestamp(this.options.now());
    const mergedItems = new Map(
      state.reviewItems.map((item) => [item.id, item]),
    );
    const existingEvents = new Map(
      state.scheduleEvents.map((event) => [event.id, event]),
    );
    for (const schedule of checked.schedules) {
      const existingItem = mergedItems.get(schedule.item.id);
      if (
        !existingItem ||
        Date.parse(schedule.item.createdAt) < Date.parse(existingItem.createdAt)
      )
        mergedItems.set(schedule.item.id, schedule.item);
      for (const event of schedule.events) {
        const previous = existingEvents.get(event.id);
        if (previous && !sameTaskValue(previous, event))
          throw new Error(
            "Legacy data conflicts with an existing review event. Neither version was overwritten.",
          );
        existingEvents.set(event.id, event);
      }
    }
    const excluded = new Map(
      state.scheduleExclusions.map((entry) => [entry.eventId, entry]),
    );
    for (const schedule of checked.schedules)
      for (const exclusion of schedule.exclusions)
        excluded.set(exclusion.eventId, exclusion);
    return this.commit({
      ...state,
      legacyBackups: [
        ...state.legacyBackups,
        { id: this.options.createId(), importedAt: now, state: preview.source },
      ],
      reviewItems: [...mergedItems.values()],
      scheduleEvents: [...existingEvents.values()],
      scheduleExclusions: [...excluded.values()],
    });
  }
  previewRestore(serialized: string): TaskRestorePreview {
    const current = this.current();
    if (serialized.length > 10_000_000)
      throw new Error("The task backup exceeds the 10 MB limit.");
    const incoming = parseTaskLearningState(JSON.parse(serialized));
    function merge<T>(
      a: readonly T[],
      b: readonly T[],
      key: (entry: T) => string,
    ): T[] {
      const values = new Map(a.map((entry) => [key(entry), entry]));
      for (const entry of b) {
        const existing = values.get(key(entry));
        if (existing && !sameTaskValue(existing, entry))
          throw new Error(
            "The backup contains conflicting revisions. Both copies have been preserved; no data was restored.",
          );
        values.set(key(entry), entry);
      }
      return [...values.values()];
    }
    const candidate = parseTaskLearningState({
      ...emptyTaskLearningState(),
      tasks: merge(
        current.tasks,
        incoming.tasks,
        (task) => `${task.id}\0${task.version}`,
      ),
      attempts: merge(
        current.attempts,
        incoming.attempts,
        (attempt) => attempt.id,
      ),
      challenges: merge(
        current.challenges,
        incoming.challenges,
        (challenge) => challenge.id,
      ),
      reviewItems: merge(
        current.reviewItems,
        incoming.reviewItems,
        (item) => item.id,
      ),
      scheduleEvents: merge(
        current.scheduleEvents,
        incoming.scheduleEvents,
        (event) => event.id,
      ),
      scheduleExclusions: merge(
        current.scheduleExclusions,
        incoming.scheduleExclusions,
        (entry) => entry.eventId,
      ),
      archivedItemIds: [
        ...new Set([...current.archivedItemIds, ...incoming.archivedItemIds]),
      ],
      legacyBackups: merge(
        current.legacyBackups,
        incoming.legacyBackups,
        (entry) => entry.id,
      ),
    });
    return {
      base: this.snapshot!.serialized,
      candidate,
      counts: {
        tasks: candidate.tasks.length,
        attempts: candidate.attempts.length,
        reviews: candidate.scheduleEvents.length,
        challenges: candidate.challenges.length,
      },
    };
  }
  confirmRestore(preview: TaskRestorePreview): TaskLearningState {
    this.current();
    if (preview.base !== this.snapshot!.serialized)
      throw new Error(
        "Learning changed after this restore preview. Preview the backup again.",
      );
    return this.commit(preview.candidate);
  }
}

export function legacyScheduleExclusions(
  state: TaskLearningState,
  legacy: LearningState,
) {
  const disputes = new Map(
    legacy.evidence
      .filter((event) => event.disputedAt)
      .map((event) => [event.id, event.disputedAt!]),
  );
  const excluded = new Set(
    state.scheduleExclusions.map((entry) => entry.eventId),
  );
  return state.scheduleEvents.flatMap((event) => {
    if (
      event.kind !== "rating" ||
      event.source !== "legacy-self-rating" ||
      !event.legacyEventId ||
      excluded.has(event.id)
    )
      return [];
    const excludedAt = disputes.get(event.legacyEventId);
    return excludedAt ? [{ eventId: event.id, excludedAt }] : [];
  });
}

export function taskSchedules(
  state: TaskLearningState,
  additionalExclusions: readonly { eventId: string; excludedAt: string }[] = [],
) {
  const events = new Map<string, typeof state.scheduleEvents>();
  for (const event of state.scheduleEvents) {
    const existing = events.get(event.itemId) ?? [];
    existing.push(event);
    events.set(event.itemId, existing);
  }
  const excluded = new Map(
    [...state.scheduleExclusions, ...additionalExclusions].map((entry) => [
      entry.eventId,
      entry,
    ]),
  );
  return state.reviewItems.map((item) => {
    const history = events.get(item.id) ?? [];
    return replayFsrsSchedule(
      item,
      history,
      history.flatMap((event) =>
        excluded.has(event.id) ? [excluded.get(event.id)!] : [],
      ),
      state.schedulerVersion,
    );
  });
}

export function archivedTaskTarget(
  state: TaskLearningState,
  target: LearningTarget,
): boolean {
  const matches = state.reviewItems.filter(
    (item) => targetKey(item.target) === targetKey(target),
  );
  return (
    matches.length > 0 &&
    matches.every((item) => state.archivedItemIds.includes(item.id))
  );
}
