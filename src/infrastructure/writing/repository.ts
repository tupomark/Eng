import {
  assertWritingWorkspace,
  emptyWritingWorkspace,
  type WritingWorkspace,
} from "@/domain/writing/workspace";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";
import { LOCAL_PURGE_MARKER } from "@/infrastructure/storage/preferences";
import { assertProfileRestoreWrite } from "@/infrastructure/profile/operation";
import {
  confirmWritingRestore,
  MAX_WRITING_BACKUP_BYTES,
  previewWritingRestore,
} from "@/domain/writing/restore";
import { hashProfileRaw } from "@/infrastructure/profile/container";

const DATABASE = "lexis.writing.v1";
const STORE = "workspaces";
export const WRITING_CHANGED_EVENT = "lexis-writing-changed";

/** Commands execute in a native read/write transaction, preserving concurrent branches. */
export class WritingRepository {
  private database: Promise<IDBDatabase> | null = null;
  private stopped = false;
  private transactions = new Set<IDBTransaction>();
  constructor(private readonly owner = "local") {}

  /** Pause for a profile operation; pending opens and commands cannot recreate this DB. */
  async stopForLocalPurge(): Promise<void> {
    this.stopped = true;
    for (const transaction of this.transactions) {
      try {
        transaction.abort();
      } catch {
        /* A completed transaction is already durable; recovery checks its baseline. */
      }
    }
    try {
      (await this.database)?.close();
    } catch {
      /* A failed open has no live handle. */
    }
    this.database = null;
  }

  private assertActive() {
    if (this.stopped)
      throw new Error(
        "Writing is paused for a local profile operation. Reopen LEXIS after it completes; your visible text has not been replaced.",
      );
    assertLocalWritesAllowed(window.localStorage);
  }

  private open(): Promise<IDBDatabase> {
    this.assertActive();
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      let failed = false;
      const fail = (message: string) => {
        failed = true;
        reject(new Error(message));
      };
      request.onupgradeneeded = () => {
        try {
          this.assertActive();
          request.result.createObjectStore(STORE);
        } catch {
          request.transaction?.abort();
          fail(
            "Writing storage is paused. Reopen LEXIS after the profile operation completes.",
          );
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (failed || this.stopped) {
          database.close();
          if (this.stopped)
            reject(
              new Error("Writing storage was closed for a profile operation."),
            );
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.database = null;
        };
        resolve(database);
      };
      request.onerror = () =>
        fail(
          "Writing storage could not be opened. Your existing data has been kept.",
        );
      request.onblocked = () =>
        fail("Close other LEXIS tabs to finish opening writing storage.");
    });
    return this.database.catch((error) => {
      this.database = null;
      throw error;
    });
  }

  async read(): Promise<WritingWorkspace> {
    const database = await this.open();
    this.assertActive();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(this.owner);
      request.onsuccess = () => {
        try {
          const value: unknown =
            request.result ?? emptyWritingWorkspace(this.owner);
          assertWritingWorkspace(value, this.owner);
          resolve(value);
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(
          new Error(
            "Writing data could not be read. Existing data is unchanged.",
          ),
        );
    });
  }

  async command(
    change: (current: WritingWorkspace) => WritingWorkspace,
  ): Promise<WritingWorkspace> {
    const database = await this.open();
    this.assertActive();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      this.transactions.add(transaction);
      const store = transaction.objectStore(STORE);
      const request = store.get(this.owner);
      let next: WritingWorkspace;
      let commandError: unknown;
      request.onsuccess = () => {
        try {
          this.assertActive();
          const current: unknown =
            request.result ?? emptyWritingWorkspace(this.owner);
          assertWritingWorkspace(current, this.owner);
          next = change(current);
          assertWritingWorkspace(next, this.owner);
          store.put(next, this.owner);
        } catch (error) {
          commandError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        this.transactions.delete(transaction);
        if (this.stopped) {
          reject(new Error("Writing was paused for a profile operation."));
          return;
        }
        window.dispatchEvent(new Event(WRITING_CHANGED_EVENT));
        // No private draft text is broadcast to other tabs.
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel(WRITING_CHANGED_EVENT);
          channel.postMessage({ owner: this.owner });
          channel.close();
        }
        resolve(next!);
      };
      transaction.onabort = transaction.onerror = () => {
        this.transactions.delete(transaction);
        reject(
          commandError ??
            new Error(
              "This writing change could not be saved. Your text is still in the editor; download a copy and retry.",
            ),
        );
      };
    });
  }

  /** Export remains possible when a newer/corrupt workspace cannot be validated. */
  async rawBackup(): Promise<unknown> {
    const database = await this.open();
    this.assertActive();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(this.owner);
      request.onsuccess = () =>
        resolve(request.result ?? emptyWritingWorkspace(this.owner));
      request.onerror = () =>
        reject(new Error("Writing data could not be exported."));
    });
  }
}

export interface WritingProfileSnapshot {
  /** IndexedDB stores objects: this preserves their JSON representation, not historical JSON input bytes. */
  raw: string | null;
  /** Exact serialized baseline used by the transaction guard; the profile journal hashes it separately. */
  signature: string | null;
}

export interface WritingProfileInspection {
  status: "absent" | "valid" | "opaque";
  counts: { drafts: number; revisions: number; conflicts: number };
  error?: string;
}

export interface WritingProfileRestorePreview {
  expectedRaw: string | null;
  nextRaw: string | null;
  changed: boolean;
  counts: WritingProfileInspection["counts"] & {
    newDrafts: number;
    newRevisions: number;
  };
  conflictDraftIds: string[];
  warnings: string[];
}

function assertKnownWritingKeys(value: object, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(
      "This writing workspace contains unrecognized fields. Export its original data for recovery; it cannot be merged safely by this app version.",
    );
}

/** The ordinary v1 reader stays compatible; profile merge cannot discard newer fields. */
function parseWritingProfile(raw: string): WritingWorkspace {
  if (raw.length > MAX_WRITING_BACKUP_BYTES)
    throw new Error("This writing backup exceeds the safe recovery limit.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "This writing workspace is unreadable. Its original data has not been changed.",
    );
  }
  assertWritingWorkspace(value, "local");
  assertKnownWritingKeys(value, ["version", "owner", "drafts"]);
  for (const draft of value.drafts) {
    assertKnownWritingKeys(draft, [
      "id",
      "title",
      "kind",
      "createdAt",
      "updatedAt",
      "headId",
      "tips",
      "revisions",
      "view",
      "archivedAt",
    ]);
    assertKnownWritingKeys(draft.view, ["start", "end", "scrollTop"]);
    for (const revision of draft.revisions)
      assertKnownWritingKeys(revision, [
        "id",
        "parentId",
        "text",
        "createdAt",
        "origin",
      ]);
  }
  return value;
}

function writingProfileCounts(
  value: WritingWorkspace,
): WritingProfileInspection["counts"] {
  return {
    drafts: value.drafts.length,
    revisions: value.drafts.reduce(
      (total, draft) => total + draft.revisions.length,
      0,
    ),
    conflicts: value.drafts.filter((draft) => draft.tips.length > 1).length,
  };
}

/** Opaque records remain exportable but are never mislabeled as safely restorable. */
export function inspectWritingProfile(
  raw: string | null,
): WritingProfileInspection {
  if (raw === null)
    return {
      status: "absent",
      counts: { drafts: 0, revisions: 0, conflicts: 0 },
    };
  try {
    return {
      status: "valid",
      counts: writingProfileCounts(parseWritingProfile(raw)),
    };
  } catch {
    return {
      status: "opaque",
      counts: { drafts: 0, revisions: 0, conflicts: 0 },
      error:
        "Writing data cannot be validated by this app version. Its original representation can be exported, but restoration is blocked to protect existing drafts.",
    };
  }
}

/** Pure preview: keeps all revisions and flags concurrent branches without choosing one. */
export function previewWritingProfileRestore(
  currentRaw: string | null,
  incomingRaw: string | null,
): WritingProfileRestorePreview {
  const current =
    currentRaw === null
      ? emptyWritingWorkspace("local")
      : parseWritingProfile(currentRaw);
  if (incomingRaw === null)
    return {
      expectedRaw: currentRaw,
      nextRaw: currentRaw,
      changed: false,
      counts: {
        ...writingProfileCounts(current),
        newDrafts: 0,
        newRevisions: 0,
      },
      conflictDraftIds: current.drafts
        .filter((draft) => draft.tips.length > 1)
        .map((draft) => draft.id),
      warnings: [],
    };
  // Validate the source separately before the legacy additive merge can omit fields.
  const incoming = parseWritingProfile(incomingRaw);
  const preview = previewWritingRestore(current, JSON.stringify(incoming));
  const candidate = confirmWritingRestore(current, preview);
  // Preserve the original representation on no-op, including whitespace/key order.
  const changed = JSON.stringify(candidate) !== JSON.stringify(current);
  const nextRaw = changed
    ? serializeWritingProfileRecord(candidate)
    : currentRaw;
  return {
    expectedRaw: currentRaw,
    nextRaw,
    changed,
    counts: {
      ...writingProfileCounts(candidate),
      newDrafts: preview.newDrafts,
      newRevisions: preview.newRevisions,
    },
    conflictDraftIds: preview.conflictDraftIds,
    warnings: preview.conflictDraftIds.length
      ? [
          "Concurrent writing branches are preserved. Review both versions in Writing Studio before choosing a revision.",
        ]
      : [],
  };
}

/** A missing record differs from a present, invalid null/string/unknown object. */
export function serializeWritingProfileRecord(value: unknown): string | null {
  if (value === undefined) return null;
  let raw: string | undefined;
  try {
    raw = JSON.stringify(value);
  } catch {
    throw new Error(
      "Writing data cannot be serialized safely. Its original storage has not been changed.",
    );
  }
  if (typeof raw !== "string" || raw.length > MAX_WRITING_BACKUP_BYTES)
    throw new Error(
      "Writing data cannot be exported within the safe backup limit. Its original storage has not been changed.",
    );
  return raw;
}

/** Reuses the ordinary additive merge rules; a caller cannot silently replace prior revisions. */
export function validateWritingProfileRestore(
  next: WritingWorkspace,
  expectedSignature: string | null,
  currentRaw: string | null,
): WritingProfileSnapshot {
  const raw = serializeWritingProfileRecord(next)!;
  parseWritingProfile(raw);
  // A journal can resume after the write committed but before its receipt was recorded.
  if (currentRaw === raw) return { raw, signature: raw };
  if (currentRaw !== expectedSignature)
    throw new Error(
      "Your writing changed after the restore preview. No draft has been replaced; preview again.",
    );
  const current =
    currentRaw === null
      ? emptyWritingWorkspace("local")
      : parseWritingProfile(currentRaw);
  const merged = confirmWritingRestore(
    current,
    previewWritingRestore(current, raw),
  );
  if (serializeWritingProfileRecord(merged) !== raw)
    throw new Error(
      "This restore would replace existing writing or discard a revision. Keep both versions and preview an additive merge.",
    );
  return { raw, signature: raw };
}

function assertProfileReadAllowed() {
  if (window.localStorage.getItem(LOCAL_PURGE_MARKER) !== null)
    throw new Error(
      "Local profile removal is in progress. Writing was not exported or changed.",
    );
}

/** Read-only export must not create an empty DB after removal or mask an absent record as valid data. */
function openProfileWritingRead(): Promise<IDBDatabase | null> {
  assertProfileReadAllowed();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE);
    let absent = false;
    let failed = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      const database = request.result;
      try {
        assertProfileReadAllowed();
        if (
          failed ||
          database.version !== 1 ||
          !database.objectStoreNames.contains(STORE)
        )
          throw new Error(
            "This writing database version cannot be backed up by this app. Its original data is preserved.",
          );
        database.onversionchange = () => database.close();
        resolve(database);
      } catch (cause) {
        database.close();
        reject(cause);
      }
    };
    request.onerror = () => {
      if (absent && !failed) {
        try {
          assertProfileReadAllowed();
          resolve(null);
        } catch (cause) {
          reject(cause);
        }
      } else
        reject(
          new Error(
            "Writing storage could not be opened for backup. Existing data is unchanged.",
          ),
        );
    };
    request.onblocked = () => {
      failed = true;
      reject(
        new Error("Close other LEXIS tabs before backing up writing storage."),
      );
    };
  });
}

export async function readWritingProfileSnapshot(): Promise<WritingProfileSnapshot> {
  const database = await openProfileWritingRead();
  if (!database) return { raw: null, signature: null };
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get("local");
    let snapshot: WritingProfileSnapshot;
    let error: unknown;
    request.onsuccess = () => {
      try {
        assertProfileReadAllowed();
        const raw = serializeWritingProfileRecord(request.result);
        snapshot = { raw, signature: raw };
      } catch (cause) {
        error = cause;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      try {
        assertProfileReadAllowed();
        resolve(snapshot!);
      } catch (cause) {
        reject(cause);
      }
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        error ??
          new Error(
            "Writing data could not be exported. Its original storage is unchanged.",
          ),
      );
    };
  });
}

function openProfileWritingRestore(operationId: string): Promise<IDBDatabase> {
  assertProfileRestoreWrite(operationId);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let failed = false;
    request.onupgradeneeded = () => {
      try {
        assertProfileRestoreWrite(operationId);
        if (failed) throw new Error("Writing restore was stopped.");
        request.result.createObjectStore(STORE);
      } catch (cause) {
        request.transaction?.abort();
        reject(cause);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      try {
        assertProfileRestoreWrite(operationId);
        if (failed || !database.objectStoreNames.contains(STORE))
          throw new Error("Writing storage could not be restored safely.");
        database.onversionchange = () => database.close();
        resolve(database);
      } catch (cause) {
        database.close();
        reject(cause);
      }
    };
    request.onerror = () =>
      reject(
        new Error(
          "Writing storage could not be opened for restoration. Existing drafts are preserved.",
        ),
      );
    request.onblocked = () => {
      failed = true;
      reject(new Error("Close other LEXIS tabs before restoring writing."));
    };
  });
}

/** One native transaction only; the enclosing profile coordinator journals cross-store progress. */
export async function applyWritingProfileRestore(
  next: WritingWorkspace,
  expectedSignature: string | null,
  operationId: string,
): Promise<WritingProfileSnapshot> {
  const nextRaw = serializeWritingProfileRecord(next)!;
  // Detach the planned object before async hashing/open: callers cannot mutate the
  // value between the confirmed hash and the eventual IndexedDB put.
  const plannedNext = parseWritingProfile(nextRaw);
  const nextHash = await hashProfileRaw(nextRaw);
  const expectedHash =
    expectedSignature === null ? null : await hashProfileRaw(expectedSignature);
  const assertAuthorizedTarget = () => {
    const marker = assertProfileRestoreWrite(operationId);
    if (
      !marker.steps.some(
        (step) =>
          step.kind === "writing" &&
          step.target === "local" &&
          step.beforeHash === expectedHash &&
          step.afterHash === nextHash,
      )
    )
      throw new Error(
        "This writing change does not match the confirmed recovery plan. Existing drafts have not been replaced.",
      );
  };
  assertAuthorizedTarget();
  const database = await openProfileWritingRestore(operationId);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.get("local");
    let snapshot: WritingProfileSnapshot;
    let error: unknown;
    request.onsuccess = () => {
      try {
        assertAuthorizedTarget();
        snapshot = validateWritingProfileRestore(
          plannedNext,
          expectedSignature,
          serializeWritingProfileRecord(request.result),
        );
        if (snapshot.raw !== serializeWritingProfileRecord(request.result))
          store.put(plannedNext, "local");
      } catch (cause) {
        error = cause;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      try {
        assertAuthorizedTarget();
        resolve(snapshot!);
      } catch (cause) {
        reject(cause);
      }
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        error ??
          new Error(
            "Writing restoration could not be committed. Existing drafts were not replaced.",
          ),
      );
    };
  });
}
