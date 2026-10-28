import {
  emptySenseContexts,
  parseSenseContexts,
  type SenseContextState,
} from "@/domain/sense-contexts";
import { assertLocalWritesAllowed } from "./local-write-guard";
export const SENSE_CONTEXTS_KEY = "lexis.sense-contexts.v1";
export const SENSE_CONTEXTS_LIMIT = 2_000_000;
export class BrowserSenseContextRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {}
  read(): { state: SenseContextState; serialized: string | null } {
    const serialized = this.storage.getItem(SENSE_CONTEXTS_KEY);
    if (serialized !== null && serialized.length > SENSE_CONTEXTS_LIMIT)
      throw new Error(
        "Saved passages are too large to open safely. Export the original before recovery.",
      );
    return {
      state:
        serialized === null
          ? emptySenseContexts()
          : parseSenseContexts(JSON.parse(serialized)),
      serialized,
    };
  }
  commit(state: SenseContextState, expected: string | null): string {
    assertLocalWritesAllowed(this.storage);
    if (this.read().serialized !== expected)
      throw new Error(
        "Your saved passages changed in another tab. Reload them before saving again.",
      );
    const serialized = JSON.stringify(parseSenseContexts(state));
    if (serialized.length > SENSE_CONTEXTS_LIMIT)
      throw new Error(
        "Saved passages reached the local size limit. Export a backup and remove unneeded passages before adding more.",
      );
    this.storage.setItem(SENSE_CONTEXTS_KEY, serialized);
    return serialized;
  }
}
