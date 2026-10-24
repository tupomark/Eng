import { LOCAL_PURGE_MARKER } from "./preferences";

// Kept for this document's lifetime: finishing deletion must not revive stale closures.
let suspended = false;
export function suspendLocalWrites(): void {
  suspended = true;
}
export function areLocalWritesSuspended(): boolean {
  return suspended;
}
export function assertLocalWritesAllowed(
  storage: Pick<Storage, "getItem">,
): void {
  if (suspended || storage.getItem(LOCAL_PURGE_MARKER))
    throw new Error(
      "Local profile deletion has paused changes. Finish deletion and start a fresh profile before saving.",
    );
}
