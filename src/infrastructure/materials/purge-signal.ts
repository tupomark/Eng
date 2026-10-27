import { assertLocalWritesAllowed as assertStorageWritesAllowed } from "@/infrastructure/storage/local-write-guard";
import { LOCAL_PURGE_MARKER } from "@/infrastructure/storage/preferences";
import {
  PROFILE_EPOCH_KEY,
  PROFILE_RESTORE_KEY,
} from "@/infrastructure/profile/operation";

const RESTORE_EVENT = "lexis-profile-restore";
const PAUSE_TIMEOUT_MS = 5_000;
type Cleanup = () => void | Promise<unknown>;
type RestoreCleanup = (
  reason: "cooperative" | "forced",
) => void | Promise<unknown>;
type RestorePhase = "check" | "pause";
type RestoreDetail = {
  phase: RestorePhase;
  register: (promise: Promise<unknown>) => void;
};
let pausedForOperation = false;
let initialEpoch: string | null | undefined;
let documentId: string | undefined;
const ownerDocumentId = () => (documentId ??= crypto.randomUUID());

/** A mounted page stays paused; releasing the operation requires a fresh page. */
export function localPurgePending(): boolean {
  if (pausedForOperation) return true;
  if (typeof window === "undefined") return false;
  try {
    const epoch = window.localStorage.getItem(PROFILE_EPOCH_KEY);
    if (initialEpoch === undefined) initialEpoch = epoch;
    if (
      window.localStorage.getItem(LOCAL_PURGE_MARKER) !== null ||
      window.localStorage.getItem(PROFILE_RESTORE_KEY) !== null ||
      initialEpoch !== epoch
    )
      pausedForOperation = true;
    return pausedForOperation;
  } catch {
    return true;
  }
}
export function assertLocalWritesAllowed(): void {
  if (typeof window !== "undefined")
    assertStorageWritesAllowed(window.localStorage);
  if (localPurgePending())
    throw new Error(
      "A local profile operation has paused changes. Finish recovery or deletion, then reopen LEXIS before saving again.",
    );
}

function registerCleanup(event: Event | undefined, cleanup: Cleanup) {
  const pending = Promise.resolve().then(cleanup);
  const detail = (event as CustomEvent<Partial<RestoreDetail>> | undefined)
    ?.detail;
  if (typeof detail?.register === "function") detail.register(pending);
  else void pending.catch(() => {});
}

/** Destructive deletion remains separate from non-destructive restore pause. */
export function subscribeToLocalPurge(cleanup: Cleanup): () => void {
  const receive = (event?: Event) => {
    pausedForOperation = true;
    registerCleanup(event, cleanup);
  };
  const storage = (event: StorageEvent) => {
    if (event.key === LOCAL_PURGE_MARKER && event.newValue !== null) receive();
  };
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("lexis-local-purge");
  if (channel) channel.onmessage = () => receive();
  window.addEventListener("lexis-local-purge", receive);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("lexis-local-purge", receive);
    window.removeEventListener("storage", storage);
    channel?.close();
  };
}

/** Checks unsaved input first; durable marker/epoch forces pause in stale tabs. */
export function subscribeToProfileRestore(
  cleanup: RestoreCleanup,
  canPause: Cleanup = () => {},
): () => void {
  const participantId = crypto.randomUUID();
  const owner = ownerDocumentId();
  if (initialEpoch === undefined)
    try {
      initialEpoch = window.localStorage.getItem(PROFILE_EPOCH_KEY);
    } catch {
      pausedForOperation = true;
    }
  const pause = (reason: "cooperative" | "forced") => {
    pausedForOperation = true;
    return cleanup(reason);
  };
  const receive = (event: Event) => {
    const detail = (event as CustomEvent<RestoreDetail>).detail;
    if (detail?.phase === "check") registerCleanup(event, canPause);
    else
      registerCleanup(event, () =>
        pause(detail?.phase === "pause" ? "cooperative" : "forced"),
      );
  };
  const storage = (event: StorageEvent) => {
    if (
      (event.key === PROFILE_RESTORE_KEY && event.newValue !== null) ||
      (event.key === PROFILE_EPOCH_KEY && event.newValue !== event.oldValue)
    )
      registerCleanup(undefined, () => pause("forced"));
  };
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(RESTORE_EVENT);
  let active = true;
  const reply = (requestId: string, phase: RestorePhase, ok: boolean) => {
    if (!active) return;
    try {
      channel?.postMessage({
        requestId,
        participantId,
        phase: phase === "check" ? "checked" : "paused",
        ok,
      });
    } catch {
      /* The initiator times out safely when a tab/channel closes during cleanup. */
    }
  };
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        !message ||
        typeof message !== "object" ||
        !("requestId" in message) ||
        typeof message.requestId !== "string" ||
        !("documentId" in message) ||
        message.documentId === owner ||
        !("phase" in message) ||
        (message.phase !== "check" && message.phase !== "pause")
      )
        return;
      const phase = message.phase;
      const requestId = message.requestId;
      void Promise.resolve()
        .then(phase === "check" ? canPause : () => pause("cooperative"))
        .then(
          () => reply(requestId, phase, true),
          () => reply(requestId, phase, false),
        );
    };
  window.addEventListener(RESTORE_EVENT, receive);
  window.addEventListener("storage", storage);
  try {
    if (window.localStorage.getItem(PROFILE_RESTORE_KEY) !== null)
      registerCleanup(undefined, () => pause("forced"));
  } catch {
    registerCleanup(undefined, () => pause("forced"));
  }
  return () => {
    active = false;
    window.removeEventListener(RESTORE_EVENT, receive);
    window.removeEventListener("storage", storage);
    channel?.close();
  };
}

function withPauseTimeout<T>(pending: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "An open workspace did not pause in time. Save or copy your input in other tabs, close those tabs, then reload and retry recovery. Existing data has not been restored.",
          ),
        ),
      PAUSE_TIMEOUT_MS,
    );
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Cooperative cleanup cannot guarantee acknowledgements from OS-frozen tabs.
 * Durable epoch guards protect subsequent writes. Run before staging, never
 * for read-only export; this deliberately does not suspend the staging guard.
 */
export async function prepareBrowserProfileRestore(): Promise<void> {
  const requestId = crypto.randomUUID();
  const owner = ownerDocumentId();
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(RESTORE_EVENT);
  const checked = new Set<string>();
  const paused = new Set<string>();
  let rejected = false;
  let completeRemotePause: (() => void) | undefined;
  const dispatch = (phase: RestorePhase) => {
    const pending: Promise<unknown>[] = [];
    window.dispatchEvent(
      new CustomEvent<RestoreDetail>(RESTORE_EVENT, {
        detail: { phase, register: (value) => pending.push(value) },
      }),
    );
    channel?.postMessage({ requestId, documentId: owner, phase });
    return Promise.all(pending);
  };
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        !message ||
        typeof message !== "object" ||
        !("requestId" in message) ||
        message.requestId !== requestId ||
        !("participantId" in message) ||
        typeof message.participantId !== "string" ||
        !("phase" in message) ||
        !("ok" in message)
      )
        return;
      if (message.ok !== true) rejected = true;
      if (message.phase === "checked") checked.add(message.participantId);
      if (message.phase === "paused") paused.add(message.participantId);
      if ([...checked].every((id) => paused.has(id))) completeRemotePause?.();
    };
  try {
    await withPauseTimeout(
      Promise.all([
        dispatch("check"),
        channel
          ? new Promise<void>((resolve) => setTimeout(resolve, 150))
          : Promise.resolve(),
      ]),
    );
    if (rejected)
      throw new Error(
        "Another workspace has unsaved input. Save or copy it before restoring; no profile data has changed.",
      );
    const remotePause = new Promise<void>((resolve) => {
      completeRemotePause = resolve;
      if (checked.size === 0) resolve();
    });
    await withPauseTimeout(Promise.all([dispatch("pause"), remotePause]));
    if (rejected)
      throw new Error(
        "An open workspace could not pause safely. Keep your input, reload LEXIS, then retry recovery; profile data has not been restored.",
      );
  } finally {
    channel?.close();
  }
}
