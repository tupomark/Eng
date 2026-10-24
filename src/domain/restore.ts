import { parseLearningState } from "./validation";
import type { Evidence, LearningState } from "./types";

export interface LearningRestorePreview {
  incoming: LearningState;
  merged: LearningState | null;
  addedMeanings: number;
  addedObservations: number;
  duplicateObservations: number;
  conflicts: { kind: "context" | "observation"; id: string }[];
}

/** A restore is an explicit merge. Colliding identities never receive a random replacement. */
export function previewLearningRestore(
  currentInput: unknown,
  incomingInput: unknown,
): LearningRestorePreview {
  const current = parseLearningState(currentInput);
  const incoming = parseLearningState(incomingInput);
  const saved = new Map(current.saved.map((item) => [item.senseId, item]));
  const evidence = new Map(current.evidence.map((item) => [item.id, item]));
  const conflicts: LearningRestorePreview["conflicts"] = [];
  let duplicateObservations = 0;
  for (const item of incoming.saved) {
    const previous = saved.get(item.senseId);
    if (!previous) saved.set(item.senseId, item);
    else if (previous.context !== item.context)
      conflicts.push({ kind: "context", id: item.senseId });
    else
      saved.set(item.senseId, {
        ...previous,
        savedAt:
          previous.savedAt < item.savedAt ? previous.savedAt : item.savedAt,
      });
  }
  for (const item of incoming.evidence) {
    const previous = evidence.get(item.id);
    if (!previous) {
      evidence.set(item.id, item);
      continue;
    }
    duplicateObservations += 1;
    const identity = (event: Evidence) =>
      JSON.stringify([
        event.id,
        event.senseId,
        event.skill,
        event.rating,
        event.occurredAt,
        event.source,
      ]);
    if (identity(previous) !== identity(item)) {
      conflicts.push({ kind: "observation", id: item.id });
      continue;
    }
    // An excluded observation must not become active through an older backup.
    const exclusions = [previous.disputedAt, item.disputedAt]
      .filter((date): date is string => Boolean(date))
      .sort();
    evidence.set(item.id, {
      ...previous,
      ...(exclusions[0] ? { disputedAt: exclusions[0] } : {}),
    });
  }
  const merged = conflicts.length
    ? null
    : parseLearningState({
        version: 1,
        saved: [...saved.values()],
        evidence: [...evidence.values()],
        readerProgress: Math.max(
          current.readerProgress,
          incoming.readerProgress,
        ),
      });
  return {
    incoming,
    merged,
    conflicts,
    addedMeanings: saved.size - current.saved.length,
    addedObservations: evidence.size - current.evidence.length,
    duplicateObservations,
  };
}
