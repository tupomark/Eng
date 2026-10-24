import type { LearningState } from "../types";
import { taskObservations, type TaskLearningState } from "../tasks/state";
import {
  LEARNING_SKILLS,
  type LearningTarget,
  type TaskSkill,
} from "../tasks/types";
import { targetKey, taskTimestamp, sameTaskValue } from "../tasks/engine";

export const OBSERVATORY_VERSION = "observatory-v1";
export const OBSERVATORY_SKILLS: readonly TaskSkill[] = [
  ...LEARNING_SKILLS,
  "grammar",
];
export interface ObservationTrailRow {
  id: string;
  sourceId: string;
  origin: "self-report" | "task";
  target: LearningTarget;
  skill: TaskSkill;
  occurredAt: string;
  excluded: boolean;
  independent: boolean | null;
  result: string;
  explanation: string;
  taskId?: string;
  taskVersion?: string;
  rubricVersion: string;
  provider: string;
}
export interface ObservationFilter {
  skill?: TaskSkill;
  target?: LearningTarget;
  /** Rolling absolute-UTC window, never an inferred local-calendar streak. */
  from?: string;
  until?: string;
  includeExcluded?: boolean;
  origin?: ObservationTrailRow["origin"];
}

export function buildObservationTrail(
  legacy: LearningState,
  tasks: TaskLearningState,
): ObservationTrailRow[] {
  const definitions = new Map(
    tasks.tasks.map((task) => [`${task.id}\0${task.version}`, task]),
  );
  const attempts = new Map(
    tasks.attempts.map((attempt) => [attempt.id, attempt]),
  );
  const challenged = new Set(
    tasks.challenges.map((challenge) => challenge.observationId),
  );
  const rows: ObservationTrailRow[] = legacy.evidence.map((event) => ({
    id: `self:${event.id}`,
    sourceId: event.id,
    origin: "self-report",
    target: { kind: "sense", senseId: event.senseId },
    skill: event.skill,
    occurredAt: event.occurredAt,
    excluded: !!event.disputedAt,
    independent: null,
    result: event.rating,
    explanation:
      "Your own recognition rating. It is a self-report, not an objective language assessment.",
    rubricVersion: "legacy-self-review-v1",
    provider: "You",
  }));
  for (const observation of taskObservations(tasks)) {
    const task = definitions.get(
      `${observation.taskId}\0${observation.taskVersion}`,
    );
    const attempt = attempts.get(observation.attemptId);
    rows.push({
      id: observation.id,
      sourceId: observation.id,
      origin: "task",
      target: { ...observation.target },
      skill: observation.skill,
      occurredAt: observation.occurredAt,
      excluded: challenged.has(observation.id),
      independent: observation.independent,
      result: observation.outcome,
      explanation: attempt?.evaluation?.explanation ?? task?.explanation ?? "",
      taskId: observation.taskId,
      taskVersion: observation.taskVersion,
      rubricVersion: observation.rubricVersion,
      provider:
        observation.evaluationSource === "provider"
          ? (observation.provider ?? "Provider not specified")
          : "Deterministic task rubric",
    });
  }
  return rows.sort(
    (a, b) =>
      Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function filterObservationTrail(
  rows: readonly ObservationTrailRow[],
  filter: ObservationFilter = {},
): ObservationTrailRow[] {
  const from = filter.from ? Date.parse(taskTimestamp(filter.from)) : -Infinity;
  const until = filter.until
    ? Date.parse(taskTimestamp(filter.until))
    : Infinity;
  if (from > until) throw new Error("The observation date range is reversed.");
  const canonical = new Map<string, ObservationTrailRow>();
  for (const row of rows) {
    const existing = canonical.get(row.id);
    if (existing && !sameTaskValue(existing, row))
      throw new Error("An observation ID has conflicting contents.");
    canonical.set(row.id, row);
  }
  return [...canonical.values()]
    .filter(
      (row) =>
        (filter.includeExcluded || !row.excluded) &&
        (!filter.skill || row.skill === filter.skill) &&
        (!filter.target ||
          targetKey(row.target) === targetKey(filter.target)) &&
        (!filter.origin || row.origin === filter.origin) &&
        Date.parse(row.occurredAt) >= from &&
        Date.parse(row.occurredAt) <= until,
    )
    .sort(
      (a, b) =>
        Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

export function summarizeObservatory(
  rows: readonly ObservationTrailRow[],
  filter: ObservationFilter = {},
) {
  const active = filterObservationTrail(rows, {
    ...filter,
    includeExcluded: false,
  });
  const selfReports = active.filter((row) => row.origin === "self-report");
  const taskRows = active.filter((row) => row.origin === "task");
  const independent = taskRows.filter((row) => row.independent);
  return {
    methodologyVersion: OBSERVATORY_VERSION,
    activeObservations: active.length,
    selfReports: selfReports.length,
    taskObservations: taskRows.length,
    independent: independent.length,
    assisted: taskRows.length - independent.length,
    independentAccepted: independent.filter((row) => row.result === "accepted")
      .length,
    independentNotYet: independent.filter((row) => row.result === "not-yet")
      .length,
    distinctTargets: new Set(active.map((row) => targetKey(row.target))).size,
    excluded: filterObservationTrail(rows, {
      ...filter,
      includeExcluded: true,
    }).filter((row) => row.excluded).length,
    skills: OBSERVATORY_SKILLS.map((skill) => {
      const selected = active.filter((row) => row.skill === skill);
      const independentlyObserved = selected.filter(
        (row) => row.origin === "task" && row.independent,
      );
      return {
        skill,
        selfReports: selected.filter((row) => row.origin === "self-report")
          .length,
        independent: independentlyObserved.length,
        assisted: selected.filter(
          (row) => row.origin === "task" && !row.independent,
        ).length,
        status: independentlyObserved.length
          ? ("observed" as const)
          : ("insufficient-data" as const),
        lastIndependentAt: independentlyObserved[0]?.occurredAt ?? null,
      };
    }),
  };
}

/** A repeated, observed difficulty is a task-specific pattern, never a learner identity. */
export function confirmedMistakePatterns(
  rows: readonly ObservationTrailRow[],
  filter: ObservationFilter = {},
) {
  const independentFailures = filterObservationTrail(rows, {
    ...filter,
    origin: "task",
    includeExcluded: false,
  }).filter((row) => row.independent && row.result === "not-yet");
  const groups = new Map<string, ObservationTrailRow[]>();
  for (const row of independentFailures) {
    const key = `${targetKey(row.target)}\0${row.skill}`;
    const entries = groups.get(key) ?? [];
    if (!entries.some((entry) => entry.id === row.id)) entries.push(row);
    groups.set(key, entries);
  }
  return [...groups.values()]
    .filter((entries) => entries.length >= 2)
    .map((entries) => ({
      target: entries[0].target,
      skill: entries[0].skill,
      count: entries.length,
      observationIds: entries.map((row) => row.id),
      latestAt: entries[0].occurredAt,
    }));
}

export function rollingObservationWindow(
  now: string,
  days: number | null,
): Pick<ObservationFilter, "from" | "until"> {
  const until = taskTimestamp(now);
  if (days === null) return { until };
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new Error("Choose a supported observation window.");
  return {
    from: new Date(Date.parse(until) - days * 86_400_000).toISOString(),
    until,
  };
}
