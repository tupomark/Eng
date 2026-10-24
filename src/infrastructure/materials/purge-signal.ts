/** A mounted page stays paused after purge; only a fresh page may start a new profile. */
let pausedForPurge = false;
export function localPurgePending(): boolean {
  if (pausedForPurge) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("lexis.local-purge.v1") !== null;
  } catch {
    return true;
  }
}
export function assertLocalWritesAllowed(): void {
  if (localPurgePending())
    throw new Error(
      "Local data removal is in progress. Reopen LEXIS after it completes before saving again.",
    );
}

export function subscribeToLocalPurge(
  cleanup: () => void | Promise<unknown>,
): () => void {
  const receive = (event?: Event) => {
    pausedForPurge = true;
    const pending = Promise.resolve(cleanup());
    const detail = (
      event as
        | CustomEvent<{ register?: (promise: Promise<unknown>) => void }>
        | undefined
    )?.detail;
    if (typeof detail?.register === "function") detail.register(pending);
  };
  const storage = (event: StorageEvent) => {
    if (event.key === "lexis.local-purge.v1" && event.newValue !== null)
      receive();
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
