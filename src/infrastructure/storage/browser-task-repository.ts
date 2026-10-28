import { assertLocalWritesAllowed } from "./local-write-guard";
import type { TaskSnapshotRepository } from "@/application/task-session";
import {
  emptyTaskLearningState,
  parseTaskLearningState,
  type TaskLearningState,
} from "@/domain/tasks/state";

export const TASK_STORAGE_KEY = "lexis.tasks.v1";

/** Separate local store: never rewrites or resets legacy lexis.learning.v1. */
export class BrowserTaskRepository implements TaskSnapshotRepository {
  constructor(private readonly storage: Storage) {}
  read() {
    const serialized = this.storage.getItem(TASK_STORAGE_KEY);
    if (serialized !== null && serialized.length > 10_000_000)
      throw new Error(
        "Task data exceeds the supported local size. Export it before recovery.",
      );
    return {
      state:
        serialized === null
          ? emptyTaskLearningState()
          : parseTaskLearningState(JSON.parse(serialized)),
      serialized,
    };
  }
  commit(state: TaskLearningState, expected: string | null): string {
    assertLocalWritesAllowed(this.storage);
    if (this.storage.getItem(TASK_STORAGE_KEY) !== expected)
      throw new Error(
        "Tasks changed in another tab. Reload task data before continuing.",
      );
    const serialized = JSON.stringify(parseTaskLearningState(state));
    if (serialized.length > 10_000_000)
      throw new Error(
        "Task data exceeds local storage limits. Export a backup before continuing.",
      );
    this.storage.setItem(TASK_STORAGE_KEY, serialized);
    return serialized;
  }
}
