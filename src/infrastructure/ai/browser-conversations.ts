import {
  emptyTutorWorkspace,
  parseTutorWorkspace,
  type TutorWorkspaceState,
} from "@/domain/ai/conversation";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";
export const TUTOR_STORAGE_PREFIX = "lexis.tutor.v1:";
export class BrowserTutorRepository {
  private expected: string | null = null;
  private readable = false;
  readonly key: string;
  constructor(
    private readonly storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    >,
    private readonly ownerScope: string,
    private readonly initialSessionId: string,
  ) {
    if (!/^(?:local|account:[a-f0-9-]{36})$/u.test(ownerScope))
      throw new Error("Tutor profile could not be selected.");
    this.key = TUTOR_STORAGE_PREFIX + ownerScope;
  }
  load(): TutorWorkspaceState {
    this.readable = false;
    this.assertNotPurging();
    const original = this.storage.getItem(this.key);
    if (original && original.length > 3_000_000)
      throw new Error(
        "Tutor history is too large to open safely. Export its original bytes before recovery.",
      );
    const state =
      original === null
        ? emptyTutorWorkspace(this.ownerScope, this.initialSessionId)
        : parseTutorWorkspace(JSON.parse(original), this.ownerScope);
    this.expected = original;
    this.readable = true;
    return state;
  }
  commit(state: TutorWorkspaceState): TutorWorkspaceState {
    this.assertNotPurging();
    if (!this.readable)
      throw new Error(
        "Tutor data could not be read. Export or recover it before changing this profile.",
      );
    if (this.storage.getItem(this.key) !== this.expected)
      throw new Error(
        "Tutor changed in another tab. Your input is kept here; reload after copying it to resolve this conflict.",
      );
    const parsed = parseTutorWorkspace(state, this.ownerScope),
      serialized = JSON.stringify(parsed);
    if (serialized.length > 3_000_000)
      throw new Error(
        "This Tutor profile has reached its local storage limit. Export and remove old conversations before continuing.",
      );
    this.storage.setItem(this.key, serialized);
    this.expected = serialized;
    return parsed;
  }
  private assertNotPurging() {
    assertLocalWritesAllowed(this.storage);
  }
  reset(confirmed: boolean): TutorWorkspaceState {
    this.assertNotPurging();
    if (!confirmed)
      throw new Error("Confirm deleting the Tutor data for this profile.");
    this.storage.removeItem(this.key);
    this.expected = null;
    this.readable = true;
    return emptyTutorWorkspace(this.ownerScope, this.initialSessionId);
  }
  exportRaw(): string {
    return (
      this.storage.getItem(this.key) ??
      JSON.stringify(
        emptyTutorWorkspace(this.ownerScope, this.initialSessionId),
      )
    );
  }
}
