import type { LearningRepository } from "@/application/ports";
import { emptyState, parseLearningState, type LearningState } from "@/domain";

export const STORAGE_KEY = "lexis.learning.v1";
export class BrowserLearningRepository implements LearningRepository {
  constructor(private readonly storage: Storage) {}
  read(): { state: LearningState; serialized: string | null } {
    const serialized = this.storage.getItem(STORAGE_KEY);
    return {
      state:
        serialized === null
          ? emptyState()
          : parseLearningState(JSON.parse(serialized)),
      serialized,
    };
  }
  commit(state: LearningState, expected: string | null): string {
    if (this.storage.getItem(STORAGE_KEY) !== expected)
      throw new Error(
        "Learning changed in another tab. Reload this page before continuing.",
      );
    const serialized = JSON.stringify(parseLearningState(state));
    this.storage.setItem(STORAGE_KEY, serialized);
    return serialized;
  }
  async load() {
    return this.read().state;
  }
  async save(state: LearningState) {
    this.commit(state, this.storage.getItem(STORAGE_KEY));
  }
}
