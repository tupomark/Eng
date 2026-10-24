"use client";
import { useMemo } from "react";
import { fsrsItemDue } from "@/domain/scheduling";
import { useLearning } from "./learning-provider";
import { useTaskLearning } from "./task-learning-provider";

/** Count objectives once: a migrated recognition item replaces its legacy queue entry. */
export function useReviewOverview() {
  const { state, now, progress } = useLearning();
  const tasks = useTaskLearning();
  const migrated = useMemo(
    () =>
      new Set(
        tasks.state.reviewItems.flatMap((item) =>
          item.target.kind === "sense" &&
          item.skill === "recognition" &&
          item.promptFamily === "self-recognition"
            ? [item.target.senseId]
            : [],
        ),
      ),
    [tasks.state.reviewItems],
  );
  const dueAt = useMemo(
    () =>
      new Map(
        progress
          .filter((item) => item.skill === "recognition")
          .map((item) => [item.senseId, item.dueAt]),
      ),
    [progress],
  );
  const legacyDue = state.saved.filter(
    (saved) =>
      !migrated.has(saved.senseId) &&
      (!dueAt.get(saved.senseId) ||
        Date.parse(dueAt.get(saved.senseId)!) <= Date.parse(now)),
  );
  const activeFsrs = tasks.schedules.filter(
    (item) => !tasks.state.archivedItemIds.includes(item.item.id),
  );
  const fsrsDue = activeFsrs.filter((item) => fsrsItemDue(item, now));
  return {
    legacyDue,
    fsrsDue,
    migrated,
    total: legacyDue.length + fsrsDue.length,
  };
}
