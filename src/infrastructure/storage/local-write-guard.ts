import { LOCAL_PURGE_MARKER } from "./preferences";
import { PROFILE_EPOCH_KEY, PROFILE_RESTORE_KEY } from "../profile/operation";

// Kept for this document's lifetime: finishing deletion must not revive stale closures.
let suspended = false;
let suspensionReason: "deletion" | "restore" | "epoch" = "deletion";
const observedEpochs = new WeakMap<object, string | null>();
// Capture the real document's generation before feature repositories read their state.
// Waiting for the first write is too late when a frozen tab missed every restore event.
if (typeof window !== "undefined") {
  try {
    const storage = window.localStorage;
    observedEpochs.set(storage, storage.getItem(PROFILE_EPOCH_KEY));
    if (storage.getItem(PROFILE_RESTORE_KEY) !== null) {
      suspended = true;
      suspensionReason = "restore";
    }
  } catch {
    // Storage access errors are reported by the caller's actual read/write operation.
  }
}
export function suspendLocalWrites(
  reason: typeof suspensionReason = "deletion",
): void {
  suspended = true;
  suspensionReason = reason;
}
export function areLocalWritesSuspended(): boolean {
  return suspended;
}
export function assertLocalWritesAllowed(
  storage: Pick<Storage, "getItem">,
): void {
  if (storage.getItem(LOCAL_PURGE_MARKER) !== null)
    throw new Error(
      "Local profile deletion has paused changes. Finish deletion and start a fresh profile before saving.",
    );
  const epoch = storage.getItem(PROFILE_EPOCH_KEY);
  if (!observedEpochs.has(storage)) observedEpochs.set(storage, epoch);
  else if (observedEpochs.get(storage) !== epoch) suspendLocalWrites("epoch");
  if (storage.getItem(PROFILE_RESTORE_KEY) !== null)
    suspendLocalWrites("restore");
  if (suspended) {
    if (suspensionReason === "deletion")
      throw new Error(
        "Local profile deletion has paused changes. Finish deletion and start a fresh profile before saving.",
      );
    throw new Error(
      suspensionReason === "epoch"
        ? "This page belongs to an earlier local profile. Reload LEXIS before making changes; your stale page has not overwritten restored data."
        : "Profile recovery has paused ordinary changes. Finish or recover the operation, then reopen LEXIS before saving.",
    );
  }
}
