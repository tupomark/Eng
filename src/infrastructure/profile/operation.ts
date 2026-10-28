import {
  parseProfileRestoreMarker,
  type ProfileRestoreMarker,
} from "@/domain/profile-recovery";
export { parseProfileRestoreMarker } from "@/domain/profile-recovery";
export type {
  ProfileRestoreMarker,
  ProfileRestoreStep,
  ProfileRestorePayload,
} from "@/domain/profile-recovery";
/** Browser-local coordination only; this is not an authentication boundary. */
export const PROFILE_RESTORE_KEY = "lexis.profile-restore.v1";
export const PROFILE_EPOCH_KEY = "lexis.profile-epoch.v1";
export const PROFILE_RESTORE_EVENT = "lexis-profile-restore";
export const PROFILE_RESTORE_MAX_MARKER_CHARS = 600_000;
const PURGE_KEY = "lexis.local-purge.v1";
const invalid = () =>
  new Error(
    "The saved profile recovery journal is unreadable. Its original bytes are preserved; reopen recovery before making changes.",
  );
export type ProfileStorageReader = Pick<Storage, "getItem">;
export type ProfileStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export function profileStorage(): ProfileStorage {
  if (typeof window === "undefined")
    throw new Error(
      "Local profile storage is unavailable in this environment.",
    );
  return window.localStorage;
}
export function assertProfileNotPurging(storage: ProfileStorageReader): void {
  if (storage.getItem(PURGE_KEY) !== null)
    throw new Error(
      "Local profile deletion has paused recovery. Finish deletion and start a fresh profile before saving.",
    );
}
export function readProfileRestoreMarker(
  storage: ProfileStorageReader = profileStorage(),
): ProfileRestoreMarker | null {
  const raw = storage.getItem(PROFILE_RESTORE_KEY);
  if (raw === null) return null;
  if (raw.length > PROFILE_RESTORE_MAX_MARKER_CHARS) throw invalid();
  try {
    return parseProfileRestoreMarker(JSON.parse(raw));
  } catch {
    throw invalid();
  }
}
/** No ambient bypass: each authorized target transaction must recheck this immediately before put. */
export function assertProfileRestoreWrite(
  operationId: string,
  storage: ProfileStorageReader = profileStorage(),
): ProfileRestoreMarker {
  assertProfileNotPurging(storage);
  const marker = readProfileRestoreMarker(storage);
  if (
    !marker ||
    marker.id !== operationId ||
    marker.status !== "running" ||
    storage.getItem(PROFILE_EPOCH_KEY) !== marker.epoch
  )
    throw new Error(
      "This profile recovery step is no longer authorized. Reopen recovery and verify the saved progress before continuing.",
    );
  return marker;
}
