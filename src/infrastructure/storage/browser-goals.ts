import { assertLocalWritesAllowed } from "./local-write-guard";
import {
  emptyGoalState,
  parseGoalState,
  type GoalState,
} from "@/domain/knowledge/goals";
export const GOALS_STORAGE_KEY = "lexis.goals.v1";
export class BrowserGoalRepository {
  constructor(private readonly storage: Storage) {}
  read() {
    const serialized = this.storage.getItem(GOALS_STORAGE_KEY);
    if (serialized !== null && serialized.length > 100_000)
      throw new Error("Goals data is too large to open safely.");
    return {
      state:
        serialized === null
          ? emptyGoalState()
          : parseGoalState(JSON.parse(serialized)),
      serialized,
    };
  }
  commit(state: GoalState, expected: string | null) {
    assertLocalWritesAllowed(this.storage);
    if (this.storage.getItem(GOALS_STORAGE_KEY) !== expected)
      throw new Error(
        "Your goals changed in another tab. Reload before saving.",
      );
    const serialized = JSON.stringify(parseGoalState(state));
    if (serialized.length > 100_000)
      throw new Error(
        "Goals data exceeds the 100 KB local limit. Export your current goals before continuing.",
      );
    this.storage.setItem(GOALS_STORAGE_KEY, serialized);
    return serialized;
  }
}
