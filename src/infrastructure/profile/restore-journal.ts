import {
  parseProfileRestoreMarker,
  type ProfileRestoreMarker,
  type ProfileRestorePayload,
} from "@/domain/profile-recovery";
import { assertLocalWritesAllowed } from "../storage/local-write-guard";
import {
  assertProfileNotPurging,
  PROFILE_EPOCH_KEY,
  PROFILE_RESTORE_EVENT,
  PROFILE_RESTORE_KEY,
  PROFILE_RESTORE_MAX_MARKER_CHARS,
  profileStorage,
  readProfileRestoreMarker,
  type ProfileStorage,
} from "./operation";
export type {
  ProfileRestoreMarker,
  ProfileRestoreStep,
  ProfileRestorePayload,
} from "@/domain/profile-recovery";

export const PROFILE_JOURNAL_DATABASE = "lexis.profile-backup.v1";
const MAX_PAYLOAD_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
export interface ProfileRestoreStageOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}
export interface StagedProfileRestoreJob {
  marker: ProfileRestoreMarker;
  ready: boolean;
}
export interface ProfileRestorePayloadStore {
  stage(
    marker: ProfileRestoreMarker,
    payloads: Record<string, ProfileRestorePayload>,
    options?: ProfileRestoreStageOptions,
  ): Promise<void>;
  load(id: string): Promise<StagedProfileRestoreJob | null>;
  payload(id: string, stepId: string): Promise<ProfileRestorePayload | null>;
  payloadIds(id: string): Promise<string[]>;
  saveMetadata(marker: ProfileRestoreMarker): Promise<void>;
  deletePayloads(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  prune(keep: number, protectId?: string): Promise<void>;
}
function aborted(options?: ProfileRestoreStageOptions): void {
  if (options?.signal?.aborted)
    throw new Error(
      "Profile recovery preparation was cancelled. No selected profile data was written.",
    );
}
function validatePayloads(
  marker: ProfileRestoreMarker,
  payloads: Record<string, ProfileRestorePayload>,
): void {
  const ids = Object.keys(payloads);
  if (
    ids.length !== marker.steps.length ||
    ids.some((id) => !marker.steps.some((step) => step.id === id))
  )
    throw new Error(
      "Recovery payloads do not match the selected steps. No profile data was written.",
    );
  // Reserve enough marker space for every eventual receipt before any staging or
  // profile write. A plan that cannot record completion must never begin.
  const largestMarker = {
    ...marker,
    status: "complete",
    completed: marker.steps.map((step) => step.id),
  };
  if (JSON.stringify(largestMarker).length > PROFILE_RESTORE_MAX_MARKER_CHARS)
    throw new Error(
      "The selected recovery plan exceeds its safe journal limit. Choose fewer sections or listening sessions.",
    );
  let total = 0;
  for (const payload of Object.values(payloads)) {
    if (
      !(payload.bytes instanceof Uint8Array) ||
      payload.bytes.byteLength > MAX_PAYLOAD_BYTES ||
      (payload.metadata !== undefined &&
        (typeof payload.metadata !== "string" ||
          payload.metadata.length > 64_000))
    )
      throw new Error("A recovery payload exceeds its safe local limit.");
    total += payload.bytes.byteLength + (payload.metadata?.length ?? 0) * 3;
  }
  if (total > MAX_TOTAL_BYTES)
    throw new Error(
      "The selected recovery data exceeds the safe local staging limit. Choose fewer media files.",
    );
}
async function payloadHash(payload: ProfileRestorePayload): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(payload.bytes).buffer,
  );
  const bytesHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const combined = new TextEncoder().encode(
    JSON.stringify([bytesHash, payload.metadata ?? null]),
  );
  const final = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(final), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function indexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined")
    throw new Error(
      "Local recovery storage is unavailable. No selected profile data was changed.",
    );
  return indexedDB;
}
/** Every payload is a separate bounded transaction. A ready job is published only after all payloads persist. */
export class IndexedDbProfileRestorePayloadStore implements ProfileRestorePayloadStore {
  constructor(
    private readonly storage: ProfileStorage,
    private readonly factory: IDBFactory = indexedDb(),
  ) {}
  private open(): Promise<IDBDatabase> {
    assertProfileNotPurging(this.storage);
    return new Promise((resolve, reject) => {
      const request = this.factory.open(PROFILE_JOURNAL_DATABASE, 1);
      let failed = false;
      request.onupgradeneeded = () => {
        try {
          assertProfileNotPurging(this.storage);
          const jobs = request.result.createObjectStore("jobs");
          jobs.createIndex("startedAt", "marker.startedAt");
          request.result.createObjectStore("payloads");
        } catch {
          failed = true;
          request.transaction?.abort();
        }
      };
      request.onsuccess = () => {
        try {
          assertProfileNotPurging(this.storage);
          if (failed)
            throw new Error("Recovery storage preparation was stopped.");
          const database = request.result;
          database.onversionchange = () => database.close();
          resolve(database);
        } catch (cause) {
          request.result.close();
          reject(cause);
        }
      };
      request.onerror = () =>
        reject(
          new Error(
            "Local recovery storage could not be opened. Existing profile data is preserved.",
          ),
        );
      request.onblocked = () => {
        failed = true;
        reject(
          new Error(
            "Close other LEXIS tabs before preparing profile recovery.",
          ),
        );
      };
    });
  }
  private async run<T>(
    names: string[],
    mode: IDBTransactionMode,
    work: (transaction: IDBTransaction, result: (value: T) => void) => void,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      let failure: unknown;
      let transaction: IDBTransaction;
      try {
        assertProfileNotPurging(this.storage);
        transaction = database.transaction(names, mode);
      } catch (cause) {
        database.close();
        reject(cause);
        return;
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onabort = transaction.onerror = () => {
        database.close();
        reject(
          failure ??
            new Error(
              "Recovery preparation could not be saved. Existing profile data is preserved.",
            ),
        );
      };
      try {
        work(transaction, (value) => {
          result = value;
        });
      } catch (cause) {
        failure = cause;
        transaction.abort();
      }
    });
  }
  async stage(
    marker: ProfileRestoreMarker,
    payloads: Record<string, ProfileRestorePayload>,
    options?: ProfileRestoreStageOptions,
  ): Promise<void> {
    let created = false;
    try {
      aborted(options);
      await this.run<void>(["jobs"], "readwrite", (transaction) => {
        const jobs = transaction.objectStore("jobs");
        const get = jobs.get(marker.id);
        get.onsuccess = () => {
          try {
            assertLocalWritesAllowed(this.storage);
            aborted(options);
            if (get.result !== undefined) {
              transaction.abort();
              return;
            }
            jobs.put({ marker, ready: false }, marker.id);
          } catch {
            transaction.abort();
          }
        };
      });
      created = true;
      let completed = 0;
      for (const step of marker.steps) {
        aborted(options);
        const payload = payloads[step.id];
        const hash = await payloadHash(payload);
        const bytes = new Uint8Array(payload.bytes).buffer;
        await this.run<void>(["payloads"], "readwrite", (transaction) => {
          assertLocalWritesAllowed(this.storage);
          aborted(options);
          transaction.objectStore("payloads").put(
            {
              bytes,
              hash,
              ...(payload.metadata === undefined
                ? {}
                : { metadata: payload.metadata }),
            },
            [marker.id, step.id],
          );
        });
        options?.onProgress?.(++completed, marker.steps.length);
      }
      await this.run<void>(["jobs"], "readwrite", (transaction) => {
        assertLocalWritesAllowed(this.storage);
        aborted(options);
        transaction.objectStore("jobs").put({ marker, ready: true }, marker.id);
      });
    } catch (cause) {
      if (created) await this.remove(marker.id).catch(() => {});
      throw cause;
    }
  }
  async load(id: string): Promise<StagedProfileRestoreJob | null> {
    return this.run(["jobs"], "readonly", (transaction, set) => {
      const get = transaction.objectStore("jobs").get(id);
      get.onsuccess = () => {
        const value = get.result as
          { marker?: unknown; ready?: unknown } | undefined;
        if (value === undefined) {
          set(null);
          return;
        }
        try {
          const marker = parseProfileRestoreMarker(value.marker);
          if (marker.id !== id || typeof value.ready !== "boolean")
            throw new Error("Invalid recovery job.");
          set({ marker, ready: value.ready });
        } catch {
          transaction.abort();
        }
      };
    });
  }
  async payload(
    id: string,
    stepId: string,
  ): Promise<ProfileRestorePayload | null> {
    const stored = await this.run<{
      bytes: unknown;
      metadata?: unknown;
      hash?: unknown;
    } | null>(["payloads"], "readonly", (transaction, set) => {
      const get = transaction.objectStore("payloads").get([id, stepId]);
      get.onsuccess = () => set(get.result ?? null);
    });
    if (!stored) return null;
    if (
      !(stored.bytes instanceof ArrayBuffer) ||
      stored.bytes.byteLength > MAX_PAYLOAD_BYTES ||
      (stored.metadata !== undefined &&
        (typeof stored.metadata !== "string" ||
          stored.metadata.length > 64_000)) ||
      typeof stored.hash !== "string"
    )
      throw new Error(
        "A staged recovery payload is unreadable. Reselect the original backup before continuing.",
      );
    const payload = {
      bytes: new Uint8Array(stored.bytes),
      ...(stored.metadata === undefined
        ? {}
        : { metadata: stored.metadata as string }),
    };
    if ((await payloadHash(payload)) !== stored.hash)
      throw new Error(
        "A staged recovery payload changed. Reselect the original backup; no further step was applied.",
      );
    return payload;
  }
  payloadIds(id: string): Promise<string[]> {
    return this.run(["payloads"], "readonly", (transaction, set) => {
      const get = transaction
        .objectStore("payloads")
        .getAllKeys(IDBKeyRange.bound([id, ""], [id, "\uffff"]));
      get.onsuccess = () =>
        set(get.result.map((key) => String((key as IDBValidKey[])[1])));
    });
  }
  saveMetadata(marker: ProfileRestoreMarker): Promise<void> {
    return this.run(["jobs"], "readwrite", (transaction) => {
      // A delayed audit update must not replace a newer receipt/status.
      const latest = readProfileRestoreMarker(this.storage);
      if (latest && JSON.stringify(latest) === JSON.stringify(marker))
        transaction.objectStore("jobs").put({ marker, ready: true }, marker.id);
    });
  }
  deletePayloads(id: string): Promise<void> {
    return this.run(["payloads"], "readwrite", (transaction) => {
      transaction
        .objectStore("payloads")
        .delete(IDBKeyRange.bound([id, ""], [id, "\uffff"]));
    });
  }
  remove(id: string): Promise<void> {
    return this.run(["jobs", "payloads"], "readwrite", (transaction) => {
      transaction.objectStore("jobs").delete(id);
      transaction
        .objectStore("payloads")
        .delete(IDBKeyRange.bound([id, ""], [id, "\uffff"]));
    });
  }
  prune(keep: number, protectId?: string): Promise<void> {
    return this.run(["jobs", "payloads"], "readwrite", (transaction) => {
      const jobs = transaction.objectStore("jobs");
      const count = jobs.count();
      count.onsuccess = () => {
        let remove = Math.max(0, count.result - keep);
        const cursor = jobs.index("startedAt").openKeyCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row || !remove) return;
          const id = String(row.primaryKey);
          // An older operation may have become active in another tab while the
          // cursor was opening. Retention cleanup never removes active payloads.
          let activeId: string | undefined;
          try {
            activeId = readProfileRestoreMarker(this.storage)?.id;
          } catch {
            transaction.abort();
            return;
          }
          if (id !== protectId && id !== activeId) {
            jobs.delete(row.primaryKey);
            transaction
              .objectStore("payloads")
              .delete(IDBKeyRange.bound([id, ""], [id, "\uffff"]));
            remove--;
          }
          row.continue();
        };
      };
    });
  }
}

export interface BrowserProfileRestoreJournalOptions {
  storage?: ProfileStorage;
  store?: ProfileRestorePayloadStore;
  now?: () => string;
  notify?: (marker: ProfileRestoreMarker) => void;
}
function notify(marker: ProfileRestoreMarker): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROFILE_RESTORE_EVENT, {
      detail: { id: marker.id, status: marker.status },
    }),
  );
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(PROFILE_RESTORE_EVENT);
    channel.postMessage({ id: marker.id, status: marker.status });
    channel.close();
  }
}
/** Marker receipts are durable locally; target stores are separate guarded steps, not one transaction. */
export class BrowserProfileRestoreJournal {
  private readonly storage: ProfileStorage;
  private readonly store: ProfileRestorePayloadStore;
  private readonly now: () => string;
  private readonly notify: (marker: ProfileRestoreMarker) => void;
  constructor(options: BrowserProfileRestoreJournalOptions = {}) {
    this.storage = options.storage ?? profileStorage();
    this.store =
      options.store ?? new IndexedDbProfileRestorePayloadStore(this.storage);
    this.now = options.now ?? (() => new Date().toISOString());
    this.notify = options.notify ?? notify;
  }
  private current(id: string): ProfileRestoreMarker {
    assertProfileNotPurging(this.storage);
    const marker = readProfileRestoreMarker(this.storage);
    if (!marker || marker.id !== id)
      throw new Error(
        "This recovery journal is no longer active. Reopen recovery before continuing.",
      );
    return marker;
  }
  private changed(marker: ProfileRestoreMarker): void {
    // Events help cooperative tabs stop resources; receipts never depend on delivery.
    try {
      this.notify(marker);
    } catch {
      /* A frozen/unsupported channel is not a failed storage commit. */
    }
  }
  private async publish(
    marker: ProfileRestoreMarker,
  ): Promise<ProfileRestoreMarker> {
    const validated = parseProfileRestoreMarker(marker);
    const latest = this.current(marker.id);
    if (latest.fileHash !== marker.fileHash || latest.epoch !== marker.epoch)
      throw new Error(
        "This recovery journal changed. No later progress has been overwritten.",
      );
    this.storage.setItem(PROFILE_RESTORE_KEY, JSON.stringify(validated));
    if (this.storage.getItem(PROFILE_RESTORE_KEY) !== JSON.stringify(validated))
      throw new Error(
        "Recovery progress could not be verified in local storage. Keep this page open and retry recovery.",
      );
    this.changed(validated);
    await this.store.saveMetadata(validated);
    return validated;
  }
  async stage(
    input: ProfileRestoreMarker,
    payloads: Record<string, ProfileRestorePayload>,
    options?: ProfileRestoreStageOptions,
  ): Promise<ProfileRestoreMarker> {
    const marker = parseProfileRestoreMarker(input);
    if (
      marker.status !== "staged" ||
      marker.completed.length ||
      marker.failedStep
    )
      throw new Error(
        "A new recovery operation must begin with an unapplied staging plan.",
      );
    validatePayloads(marker, payloads);
    assertLocalWritesAllowed(this.storage);
    if (readProfileRestoreMarker(this.storage))
      throw new Error(
        "Finish the existing profile recovery before preparing another backup.",
      );
    aborted(options);
    await this.store.prune(9);
    await this.store.stage(marker, payloads, options);
    try {
      const job = await this.store.load(marker.id);
      if (!job?.ready || JSON.stringify(job.marker) !== JSON.stringify(marker))
        throw new Error(
          "The complete recovery plan could not be verified in staging. No selected profile data was written.",
        );
      // Commit acknowledgement alone is not a backup verification. Read every staged
      // bounded payload back before exposing a marker that can authorize live writes.
      for (const step of marker.steps) {
        aborted(options);
        const stored = await this.store.payload(marker.id, step.id);
        if (
          !stored ||
          (await payloadHash(stored)) !== (await payloadHash(payloads[step.id]))
        )
          throw new Error(
            "Staged recovery data could not be verified. No selected profile data was written.",
          );
      }
      aborted(options);
      assertLocalWritesAllowed(this.storage);
      if (readProfileRestoreMarker(this.storage))
        throw new Error(
          "Another recovery operation began while this backup was being prepared.",
        );
      this.storage.setItem(PROFILE_RESTORE_KEY, JSON.stringify(marker));
      if (this.storage.getItem(PROFILE_RESTORE_KEY) !== JSON.stringify(marker))
        throw new Error(
          "The recovery safety marker could not be verified. No selected profile data was written.",
        );
      this.changed(marker);
      return marker;
    } catch (cause) {
      // If marker publication committed before a read/channel error, preserve the
      // payloads it refers to. Removing them would turn a retryable error into loss.
      try {
        if (readProfileRestoreMarker(this.storage)?.id !== marker.id)
          await this.store.remove(marker.id).catch(() => {});
      } catch {
        /* Retaining an orphan staging job is safer than deleting a possibly active one. */
      }
      throw cause;
    }
  }
  async load(id: string): Promise<ProfileRestoreMarker | null> {
    assertProfileNotPurging(this.storage);
    const marker = readProfileRestoreMarker(this.storage);
    const job = await this.store.load(id);
    if (marker?.id === id) {
      if (
        job &&
        (job.marker.fileHash !== marker.fileHash ||
          job.marker.epoch !== marker.epoch)
      )
        throw new Error(
          "Recovery metadata conflicts with its original staging job. No profile data was changed.",
        );
      return marker;
    }
    return job?.marker ?? null;
  }
  async payload(
    id: string,
    stepId: string,
  ): Promise<ProfileRestorePayload | null> {
    this.current(id);
    return this.store.payload(id, stepId);
  }
  async begin(id: string): Promise<ProfileRestoreMarker> {
    let marker = this.current(id);
    if (!["staged", "partial", "running"].includes(marker.status))
      throw new Error(
        "This recovery operation is already finished. Reopen the restored profile.",
      );
    const job = await this.store.load(id);
    const payloads = new Set(await this.store.payloadIds(id));
    if (!job?.ready || marker.steps.some((step) => !payloads.has(step.id)))
      throw new Error(
        "Staged recovery data is missing. Reselect the original backup; already applied progress stays recorded.",
      );
    if (
      job.marker.id !== marker.id ||
      job.marker.fileHash !== marker.fileHash ||
      job.marker.epoch !== marker.epoch ||
      JSON.stringify(job.marker.steps) !== JSON.stringify(marker.steps)
    )
      throw new Error(
        "Staged recovery data belongs to another plan. No further profile data was written.",
      );
    // Recheck all hashes, including earlier steps, before any target is authorized.
    // A file evicted or damaged since staging must not produce a half-new plan.
    for (const step of marker.steps) {
      if (!(await this.store.payload(id, step.id)))
        throw new Error(
          "Staged recovery data is missing. Reselect the original backup; already applied progress stays recorded.",
        );
    }
    marker = this.current(id);
    if (!["staged", "partial", "running"].includes(marker.status))
      throw new Error(
        "This recovery operation was resolved while its staged data was checked. Reopen the restored profile.",
      );
    if (
      JSON.stringify(job.marker.steps) !== JSON.stringify(marker.steps) ||
      job.marker.fileHash !== marker.fileHash ||
      job.marker.epoch !== marker.epoch
    )
      throw new Error(
        "The recovery plan changed during verification. No further profile data was written.",
      );
    if (
      marker.status !== "staged" &&
      this.storage.getItem(PROFILE_EPOCH_KEY) !== marker.epoch
    )
      throw new Error(
        "The local profile changed after this recovery began. Existing history has not been overwritten.",
      );
    this.storage.setItem(PROFILE_EPOCH_KEY, marker.epoch);
    const rest = { ...marker };
    delete rest.failedStep;
    return this.publish({ ...rest, status: "running", updatedAt: this.now() });
  }
  async receipt(id: string, stepId: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (marker.status !== "running")
      throw new Error(
        "Resume this paused recovery before recording another applied step.",
      );
    if (marker.completed.includes(stepId)) return marker;
    if (marker.steps[marker.completed.length]?.id !== stepId)
      throw new Error("Recovery receipts must follow the selected step order.");
    return this.publish({
      ...marker,
      completed: [...marker.completed, stepId],
      updatedAt: this.now(),
    });
  }
  async pause(id: string, failedStep?: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (marker.status !== "running" && marker.status !== "partial")
      throw new Error("Only an active recovery operation can be paused.");
    return this.publish({
      ...marker,
      status: "partial",
      updatedAt: this.now(),
      ...(failedStep ? { failedStep } : {}),
    });
  }
  async complete(id: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (marker.status === "complete") return marker;
    if (
      marker.status !== "running" ||
      marker.completed.length !== marker.steps.length
    )
      throw new Error(
        "Recovery cannot report completion before every selected step is verified and recorded.",
      );
    return this.publish({
      ...marker,
      status: "complete",
      updatedAt: this.now(),
    });
  }
  async cancelBeforeWrites(id: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    // No receipt does not prove no write: a target commit may have succeeded before receipt storage failed.
    if (marker.status !== "staged")
      throw new Error(
        "Recovery has already begun. Resume it or explicitly keep the partial result; no blind rollback is available.",
      );
    return this.publish({
      ...marker,
      status: "cancelled",
      updatedAt: this.now(),
    });
  }
  async acceptPartial(id: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (marker.status !== "partial")
      throw new Error(
        "Pause recovery before explicitly accepting its partial result.",
      );
    return this.publish({
      ...marker,
      status: "partial-accepted",
      updatedAt: this.now(),
    });
  }
  async releaseFinished(id: string): Promise<void> {
    const marker = this.current(id);
    if (!["complete", "cancelled", "partial-accepted"].includes(marker.status))
      throw new Error(
        "Finish or explicitly resolve profile recovery before reopening ordinary work.",
      );
    await this.store.saveMetadata(marker);
    await this.store.deletePayloads(id);
    await this.store.prune(10, id);
    const latest = this.current(id);
    if (JSON.stringify(latest) !== JSON.stringify(marker))
      throw new Error(
        "Recovery changed during cleanup. Its safety marker remains in place.",
      );
    this.storage.removeItem(PROFILE_RESTORE_KEY);
    if (this.storage.getItem(PROFILE_RESTORE_KEY) !== null)
      throw new Error(
        "The recovery marker could not be cleared. Reopen recovery and retry cleanup before ordinary changes.",
      );
    // Never reset this document's write suspension. The caller performs a full navigation.
  }
}
