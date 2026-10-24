import { LEARNING_SKILLS, type TaskSkill } from "../tasks/types";
import { taskIdentifier, taskTimestamp } from "../tasks/engine";
import {
  filterObservationTrail,
  type ObservationTrailRow,
} from "./observatory";

export interface LearningGoal {
  id: string;
  title: string;
  term: "short" | "long";
  domain: string;
  skill: TaskSkill | "any";
  measure: "independent-attempts" | "independent-accepted";
  targetCount: number;
  cadence: "7-days" | "30-days" | "since-start";
  createdAt: string;
  updatedAt: string;
  revision: number;
  archived: boolean;
}
export interface GoalState {
  version: 1;
  goals: LearningGoal[];
}
export const emptyGoalState = (): GoalState => ({ version: 1, goals: [] });

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Goal text must contain 1–${max} characters.`);
  return value;
}
export function parseGoal(value: unknown): LearningGoal {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid goal data.");
  const item = value as Record<string, unknown>;
  const goal: LearningGoal = {
    id: text(item.id, 200),
    title: text(item.title, 240),
    term: text(item.term, 10) as LearningGoal["term"],
    domain: text(item.domain, 160),
    skill: text(item.skill, 40) as LearningGoal["skill"],
    measure: text(item.measure, 40) as LearningGoal["measure"],
    targetCount: item.targetCount as number,
    cadence: text(item.cadence, 20) as LearningGoal["cadence"],
    createdAt: taskTimestamp(text(item.createdAt, 40)),
    updatedAt: taskTimestamp(text(item.updatedAt, 40)),
    revision: item.revision as number,
    archived: item.archived as boolean,
  };
  if (
    !["short", "long"].includes(goal.term) ||
    !["7-days", "30-days", "since-start"].includes(goal.cadence) ||
    !["independent-attempts", "independent-accepted"].includes(goal.measure)
  )
    throw new Error("Unsupported goal settings.");
  if (
    goal.skill !== "any" &&
    goal.skill !== "grammar" &&
    !LEARNING_SKILLS.includes(goal.skill)
  )
    throw new Error("Unknown goal skill.");
  if (
    !Number.isInteger(goal.targetCount) ||
    goal.targetCount < 1 ||
    goal.targetCount > 500 ||
    !Number.isSafeInteger(goal.revision) ||
    goal.revision < 1 ||
    typeof goal.archived !== "boolean"
  )
    throw new Error("Invalid goal target or revision.");
  if (Date.parse(goal.updatedAt) < Date.parse(goal.createdAt))
    throw new Error("Goal updates cannot predate their creation.");
  return goal;
}
export function parseGoalState(value: unknown): GoalState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid goals backup.");
  const item = value as Record<string, unknown>;
  if (
    item.version !== 1 ||
    !Array.isArray(item.goals) ||
    item.goals.length > 100
  )
    throw new Error("Unsupported goals version or collection size.");
  const goals = item.goals.map(parseGoal);
  if (new Set(goals.map((goal) => goal.id)).size !== goals.length)
    throw new Error("Duplicate goal identifiers.");
  return { version: 1, goals };
}

export function addGoal(state: GoalState, goal: LearningGoal): GoalState {
  const parsed = parseGoal(goal);
  if (state.goals.some((entry) => entry.id === parsed.id))
    throw new Error("This goal ID already exists.");
  return parseGoalState({ ...state, goals: [...state.goals, parsed] });
}

export function previewGoalRestore(current: GoalState, incoming: unknown) {
  const restored = parseGoalState(incoming);
  const goals = new Map(current.goals.map((goal) => [goal.id, goal]));
  let added = 0;
  for (const goal of restored.goals) {
    const existing = goals.get(goal.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(goal))
      throw new Error(
        "This backup conflicts with an existing goal revision. Both copies are preserved; export them before choosing a version.",
      );
    if (!existing) added += 1;
    goals.set(goal.id, goal);
  }
  return {
    state: parseGoalState({ version: 1, goals: [...goals.values()] }),
    incoming: restored.goals.length,
    added,
  };
}
export function reviseGoal(
  state: GoalState,
  id: string,
  expectedRevision: number,
  changes: Partial<Omit<LearningGoal, "id" | "createdAt" | "revision">>,
  now: string,
): GoalState {
  taskIdentifier(id, "Goal ID");
  const existing = state.goals.find((goal) => goal.id === id);
  if (!existing) throw new Error("This goal could not be found.");
  if (existing.revision !== expectedRevision)
    throw new Error(
      "This goal changed after your preview. Review the latest version.",
    );
  const updated = parseGoal({
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: taskTimestamp(now),
    revision: existing.revision + 1,
  });
  return {
    ...state,
    goals: state.goals.map((goal) => (goal.id === id ? updated : goal)),
  };
}

export function goalProgress(
  goal: LearningGoal,
  rows: readonly ObservationTrailRow[],
  now: string,
) {
  const until = taskTimestamp(now);
  const cadenceDays =
    goal.cadence === "7-days" ? 7 : goal.cadence === "30-days" ? 30 : null;
  const from = new Date(
    Math.max(
      Date.parse(goal.createdAt),
      cadenceDays === null
        ? -Infinity
        : Date.parse(until) - cadenceDays * 86_400_000,
    ),
  ).toISOString();
  const clockIssue = Date.parse(until) < Date.parse(from);
  const eligible = clockIssue
    ? []
    : filterObservationTrail(rows, {
        from,
        until,
        origin: "task",
        includeExcluded: false,
        ...(goal.skill === "any" ? {} : { skill: goal.skill }),
      }).filter(
        (row) =>
          row.independent &&
          (goal.measure === "independent-attempts" ||
            row.result === "accepted"),
      );
  return {
    count: new Set(eligible.map((row) => row.id)).size,
    target: goal.targetCount,
    from,
    until,
    sourceIds: eligible.map((row) => row.id),
    measure: goal.measure,
    clockIssue,
    methodologyVersion: "goal-observations-v1" as const,
  };
}

export interface GoalSuggestion {
  goalId: string;
  expectedRevision: number;
  proposedTarget: number;
  reason: string;
  evidenceIds: string[];
  policyVersion: "local-goal-load-v1";
}
/** Optional planning aid, not a diagnosis, AI claim or automatic change. */
export function suggestGoalLoad(
  goal: LearningGoal,
  rows: readonly ObservationTrailRow[],
  now: string,
): GoalSuggestion | null {
  const progress = goalProgress(goal, rows, now);
  if (progress.clockIssue) return null;
  const failures = filterObservationTrail(rows, {
    from: progress.from,
    until: progress.until,
    origin: "task",
    includeExcluded: false,
    ...(goal.skill === "any" ? {} : { skill: goal.skill }),
  }).filter((row) => row.independent && row.result === "not-yet");
  if (failures.length < 2 || goal.targetCount < 3 || goal.archived) return null;
  return {
    goalId: goal.id,
    expectedRevision: goal.revision,
    proposedTarget: Math.max(1, Math.floor(goal.targetCount * 0.75)),
    reason: `There are ${failures.length} independent attempts marked “not yet” in this goal's window. You can choose a smaller practice target and leave more room for revisiting explanations. This planning rule does not diagnose your ability.`,
    evidenceIds: failures.map((row) => row.id),
    policyVersion: "local-goal-load-v1",
  };
}
