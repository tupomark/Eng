import {
  taskObservations,
  type TaskLearningState,
} from "../domain/tasks/state";
import { targetKey } from "../domain/tasks/engine";
import type { TaskDefinition } from "../domain/tasks/types";

export interface AssessmentWithdrawalPolicy {
  id: string;
  taskId: string;
  taskVersion: string;
  rubricVersion: string;
  effectiveAt: string;
  reason: string;
}

/** An application content decision, not a change to the original task/evaluation. */
export const ASSESSMENT_WITHDRAWAL_POLICIES: readonly AssessmentWithdrawalPolicy[] =
  [
    {
      id: "listening-location-target-mismatch-v1",
      taskId: "listening:original-coast:location",
      taskVersion: "original-coast-v1",
      rubricVersion: "original-listening-location-v1",
      effectiveAt: "2026-10-24T00:00:00.000Z",
      reason:
        "Withdrawn assessment: identifying a place in this recording did not establish understanding of the target meaning of linger. The original answer and verdict remain in the audit; neither success nor failure affects competence or scheduling.",
    },
  ];
export function withdrawnTaskDefinition(
  task: TaskDefinition,
  policies: readonly AssessmentWithdrawalPolicy[],
): boolean {
  return policies.some(
    (policy) =>
      policy.taskId === task.id &&
      policy.taskVersion === task.version &&
      policy.rubricVersion === task.rubricVersion,
  );
}
/** Safe, deterministic projection is usable even when persisting the correction fails. */
export function applyAssessmentWithdrawals(
  state: TaskLearningState,
  policies: readonly AssessmentWithdrawalPolicy[],
): TaskLearningState {
  const tasks = new Map(
    state.tasks.map((task) => [`${task.id}\0${task.version}`, task]),
  );
  const challenges = [...state.challenges];
  const exclusions = new Map(
    state.scheduleExclusions.map((entry) => [entry.eventId, entry]),
  );
  const challenged = new Set(challenges.map((entry) => entry.observationId));
  const ratingEvents = new Map<string, typeof state.scheduleEvents>();
  for (const event of state.scheduleEvents) {
    if (event.kind !== "rating" || !event.attemptId) continue;
    const events = ratingEvents.get(event.attemptId) ?? [];
    events.push(event);
    ratingEvents.set(event.attemptId, events);
  }
  const objectives = new Map<string, TaskDefinition[]>();
  const objectiveKey = (
    value: Pick<TaskDefinition, "target" | "skill" | "promptFamily">,
  ) => `${targetKey(value.target)}\0${value.skill}\0${value.promptFamily}`;
  for (const task of state.tasks) {
    const key = objectiveKey(task);
    const list = objectives.get(key) ?? [];
    list.push(task);
    objectives.set(key, list);
  }
  const archivedItemIds = new Set(state.archivedItemIds);
  let changed = false;
  // Retire an obsolete objective only when it has no still-valid task format.
  for (const item of state.reviewItems) {
    const related = objectives.get(objectiveKey(item)) ?? [];
    if (
      related.length &&
      related.every((task) => withdrawnTaskDefinition(task, policies)) &&
      !archivedItemIds.has(item.id)
    ) {
      archivedItemIds.add(item.id);
      changed = true;
    }
  }
  for (const observation of taskObservations(state)) {
    const task = tasks.get(`${observation.taskId}\0${observation.taskVersion}`);
    if (!task) continue;
    const policy = policies.find(
      (entry) =>
        entry.taskId === task.id &&
        entry.taskVersion === task.version &&
        entry.rubricVersion === task.rubricVersion,
    );
    if (!policy) continue;
    const challengedAt = new Date(
      Math.max(
        Date.parse(policy.effectiveAt),
        Date.parse(observation.occurredAt),
      ),
    ).toISOString();
    if (!challenged.has(observation.id)) {
      challenges.push({
        id: `withdrawal:${policy.id}:${observation.id}`,
        observationId: observation.id,
        challengedAt,
        reason: policy.reason,
        initiator: "assessment-policy",
        policyId: policy.id,
      });
      challenged.add(observation.id);
      changed = true;
    }
    for (const event of ratingEvents.get(observation.attemptId) ?? []) {
      if (
        event.kind !== "rating" ||
        event.attemptId !== observation.attemptId ||
        exclusions.has(event.id)
      )
        continue;
      exclusions.set(event.id, {
        eventId: event.id,
        excludedAt: new Date(
          Math.max(Date.parse(challengedAt), Date.parse(event.occurredAt)),
        ).toISOString(),
      });
      changed = true;
    }
  }
  return changed
    ? {
        ...state,
        challenges,
        archivedItemIds: [...archivedItemIds],
        scheduleExclusions: [...exclusions.values()],
      }
    : state;
}
