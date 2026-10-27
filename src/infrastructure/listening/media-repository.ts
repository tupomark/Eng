import {
  initialListeningSession,
  MEDIA_LIMITS,
  parseListeningSession,
  type ListeningSession,
} from "@/domain/listening/session";
import { assertLocalWritesAllowed } from "@/infrastructure/materials/purge-signal";
import { assertProfileRestoreWrite } from "@/infrastructure/profile/operation";
import {
  canonicalMediaSession,
  createMediaBackupSnapshot,
  MEDIA_BACKUP_MAX_SESSIONS,
  mediaBackupAssetFingerprint,
  mediaBackupSessionFingerprint,
  parseMediaBackupAsset,
  sameMediaBackupAsset,
  sameMediaBackupSession,
  sha256MediaBytes,
  type MediaBackupAssetMetadata,
  type MediaBackupSnapshot,
} from "@/infrastructure/profile/media-backup";

export const MEDIA_DATABASE_NAME = "lexis.media.local.v1";
export const LISTENING_SAMPLE_ID = "lexis-original-coast-v1";
export interface LocalMediaAsset {
  id: string;
  owner: "local";
  title: string;
  fileName: string;
  mime: string;
  kind: "audio" | "video";
  byteLength: number;
  createdAt: string;
  blob: Blob;
}

export function sniffMedia(
  bytes: Uint8Array,
  fileName: string,
  declaredType: string,
): { mime: string; kind: "audio" | "video" } {
  const word = (offset: number, size: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + size));
  if (bytes.length >= 12 && word(0, 4) === "RIFF" && word(8, 4) === "WAVE")
    return { mime: "audio/wav", kind: "audio" };
  if (word(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0))
    return { mime: "audio/mpeg", kind: "audio" };
  if (word(0, 4) === "OggS") return { mime: "audio/ogg", kind: "audio" };
  if (bytes.length >= 12 && word(4, 4) === "ftyp")
    return /\.m4a$/iu.test(fileName) || declaredType === "audio/mp4"
      ? { mime: "audio/mp4", kind: "audio" }
      : { mime: "video/mp4", kind: "video" };
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return declaredType.startsWith("audio/")
      ? { mime: "audio/webm", kind: "audio" }
      : { mime: "video/webm", kind: "video" };
  throw new Error(
    "This is not a supported audio/video file. Choose WAV, MP3, Ogg, M4A/MP4 or WebM supported by your browser.",
  );
}

function openDatabase(operationId?: string): Promise<IDBDatabase> {
  const authorize = () =>
    operationId === undefined
      ? assertLocalWritesAllowed()
      : assertProfileRestoreWrite(operationId);
  authorize();
  return new Promise((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(MEDIA_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      try {
        authorize();
        const db = request.result;
        db.createObjectStore("assets", { keyPath: "id" });
        db.createObjectStore("sessions", { keyPath: "id" });
      } catch (cause) {
        failed = true;
        request.transaction?.abort();
        reject(cause);
      }
    };
    request.onerror = () => {
      failed = true;
      reject(
        new Error(
          "Private media storage is unavailable. Your file has not been uploaded.",
        ),
      );
    };
    request.onblocked = () => {
      failed = true;
      reject(
        new Error("Close another LEXIS tab before opening media storage."),
      );
    };
    request.onsuccess = () => {
      try {
        authorize();
      } catch (cause) {
        request.result.close();
        reject(cause);
        return;
      }
      if (failed) request.result.close();
      else resolve(request.result);
    };
  });
}

export type LocalMediaMetadata = Omit<LocalMediaAsset, "blob">;
type StoredMedia = LocalMediaAsset & { encoding?: unknown; data?: unknown };

function mediaMetadata(value: unknown): LocalMediaMetadata {
  if (!value || typeof value !== "object")
    throw new Error("A local media file could not be opened.");
  const asset = value as StoredMedia;
  const storedBytes =
    asset.blob instanceof Blob
      ? asset.blob.size
      : asset.encoding === "array-buffer-v1" &&
          asset.data instanceof ArrayBuffer
        ? asset.data.byteLength
        : 0;
  if (
    asset.owner !== "local" ||
    typeof asset.id !== "string" ||
    !asset.id ||
    asset.id.length > 200 ||
    typeof asset.title !== "string" ||
    asset.title.length > 300 ||
    typeof asset.fileName !== "string" ||
    asset.fileName.length > 500 ||
    !["audio", "video"].includes(asset.kind) ||
    typeof asset.mime !== "string" ||
    asset.mime.length > 100 ||
    !Number.isFinite(Date.parse(asset.createdAt)) ||
    asset.byteLength !== storedBytes ||
    asset.byteLength > MEDIA_LIMITS.maxFileBytes ||
    asset.byteLength <= 0
  )
    throw new Error(
      "A local media file is unreadable. Its data has not been replaced.",
    );
  return {
    id: asset.id,
    owner: "local",
    title: asset.title,
    fileName: asset.fileName,
    mime: asset.mime,
    kind: asset.kind,
    byteLength: asset.byteLength,
    createdAt: asset.createdAt,
  };
}

/** Old native Blob records remain readable; bytes support WebKit builds without Blob IDB. */
export function decodeStoredMedia(value: unknown): LocalMediaAsset {
  const metadata = mediaMetadata(value);
  const record = value as StoredMedia;
  const blob =
    record.blob instanceof Blob
      ? record.blob
      : new Blob([record.data as ArrayBuffer], { type: metadata.mime });
  return { ...metadata, blob };
}

/** Walk one bounded record at a time; retain metadata, never a whole library of byte arrays. */
export async function listLocalMedia(): Promise<LocalMediaMetadata[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("assets", "readonly");
    const result: LocalMediaMetadata[] = [];
    const request = transaction.objectStore("assets").openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try {
        if (result.length >= MEDIA_LIMITS.maxFiles)
          throw new Error("The local media list exceeds its supported limit.");
        result.push(mediaMetadata(cursor.value));
        cursor.continue();
      } catch (cause) {
        transaction.abort();
        reject(cause);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(new Error("Your media list could not be opened."));
    };
  });
}

/** Only the selected recording materializes a playback Blob. */
export async function loadLocalMedia(
  sourceId: string,
): Promise<LocalMediaAsset | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("assets", "readonly");
    const request = transaction.objectStore("assets").get(sourceId);
    let result: LocalMediaAsset | null = null;
    request.onsuccess = () => {
      try {
        result =
          request.result === undefined
            ? null
            : decodeStoredMedia(request.result);
      } catch (cause) {
        transaction.abort();
        reject(cause);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        new Error(
          "Your selected media could not be opened. Its original data has been preserved.",
        ),
      );
    };
  });
}

export async function saveLocalMedia(
  file: File,
  canPlay: (mime: string) => boolean,
  verifyPlayable?: (blob: Blob, kind: "audio" | "video") => Promise<void>,
): Promise<LocalMediaAsset> {
  if (!file.size || file.size > MEDIA_LIMITS.maxFileBytes)
    throw new Error("Choose a nonempty audio/video file up to 25 MB.");
  const type = sniffMedia(
    new Uint8Array(await file.slice(0, 64).arrayBuffer()),
    file.name,
    file.type,
  );
  if (!canPlay(type.mime))
    throw new Error(
      "This browser cannot play that media type. Convert a copy to WAV/MP3 or a supported MP4 before importing.",
    );
  if (verifyPlayable)
    await verifyPlayable(file.slice(0, file.size, type.mime), type.kind);
  const data = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", data);
  const id =
    "media-" +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  const asset: LocalMediaAsset = {
    id,
    owner: "local",
    title: file.name.replace(/\.[^.]+$/u, "").slice(0, 300),
    fileName: file.name.slice(0, 500),
    mime: type.mime,
    kind: type.kind,
    byteLength: file.size,
    createdAt: new Date().toISOString(),
    blob: file.slice(0, file.size, type.mime),
  };
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("assets", "readwrite");
    const store = transaction.objectStore("assets");
    let result = asset;
    let failure =
      "The file could not be saved on this device. Your existing media is intact.";
    const existing = store.get(id);
    existing.onsuccess = () => {
      try {
        assertLocalWritesAllowed();
      } catch {
        transaction.abort();
        return;
      }
      if (existing.result) {
        try {
          result = decodeStoredMedia(existing.result);
        } catch {
          transaction.abort();
        }
        return;
      }
      const count = store.count();
      count.onsuccess = () => {
        try {
          assertLocalWritesAllowed();
        } catch {
          transaction.abort();
          return;
        }
        if (count.result >= MEDIA_LIMITS.maxFiles) {
          failure =
            "This device supports 10 media files. Remove one before adding another.";
          transaction.abort();
        } else
          store.add({
            ...asset,
            blob: null,
            encoding: "array-buffer-v1",
            data,
          });
      };
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error(failure));
    };
    transaction.onerror = () => {
      database.close();
      reject(new Error(failure));
    };
  });
}

export async function loadListeningSession(
  sourceId: string,
): Promise<ListeningSession> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("sessions", "readonly");
    const request = transaction
      .objectStore("sessions")
      .get(`session:${sourceId}`);
    request.onsuccess = () => {
      try {
        const loaded =
          request.result === undefined
            ? initialListeningSession(sourceId)
            : parseListeningSession(request.result);
        if (loaded.sourceId !== sourceId)
          throw new Error("Source identity mismatch");
        resolve(loaded);
      } catch {
        reject(
          new Error(
            "Your listening session could not be opened. Its original data has been kept.",
          ),
        );
      }
    };
    request.onerror = () =>
      reject(new Error("Your listening position could not be opened."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(new Error("Your listening position could not be opened."));
    };
  });
}

export async function commitListeningSession(
  session: ListeningSession,
  expectedRevision: number,
): Promise<ListeningSession> {
  const next = parseListeningSession({
    ...session,
    revision: expectedRevision + 1,
  });
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("sessions", "readwrite");
    const store = transaction.objectStore("sessions");
    let conflict = false;
    let unreadable = false;
    const request = store.get(next.id);
    request.onsuccess = () => {
      let stored: ListeningSession | undefined;
      try {
        assertLocalWritesAllowed();
        stored =
          request.result === undefined
            ? undefined
            : parseListeningSession(request.result);
      } catch {
        unreadable = true;
        transaction.abort();
        return;
      }
      if ((stored?.revision ?? 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put(next);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(next);
    };
    transaction.onabort = () => {
      database.close();
      reject(
        new Error(
          conflict
            ? "This listening session changed in another tab. Your current position is kept for this visit; reopen before saving again."
            : unreadable
              ? "This listening session cannot be safely updated. Its original data has been preserved; reopen after any local removal completes."
              : "This listening session could not be saved. Your previous saved session remains intact.",
        ),
      );
    };
    transaction.onerror = () => {
      database.close();
      reject(
        new Error(
          "This listening session could not be saved. Your previous saved session remains intact.",
        ),
      );
    };
  });
}

export async function deleteLocalMedia(sourceId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      assertLocalWritesAllowed();
    } catch (cause) {
      database.close();
      reject(cause);
      return;
    }
    const transaction = database.transaction(
      ["assets", "sessions"],
      "readwrite",
    );
    transaction.objectStore("assets").delete(sourceId);
    transaction.objectStore("sessions").delete(`session:${sourceId}`);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(
        new Error(
          "The file could not be deleted. Your existing media remains available.",
        ),
      );
    };
  });
}

export async function clearLocalListeningData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(MEDIA_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new Error(
          "Local media could not be deleted. Its existing data is still present.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other LEXIS media tabs before deleting local recordings.",
        ),
      );
  });
}

export interface MediaBackupReadOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}
function checkBackupRead(options?: MediaBackupReadOptions): void {
  if (options?.signal?.aborted)
    throw new DOMException(
      "Media backup was cancelled. No source data was changed.",
      "AbortError",
    );
}

/** Unlike ordinary workspace opening, inspection never creates a missing database. */
function openMediaBackupDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false;
    let failed = false;
    const request = indexedDB.open(MEDIA_DATABASE_NAME);
    request.onupgradeneeded = () => {
      // A missing DB is version0. Aborting creation leaves the browser without a new store.
      absent = true;
      request.transaction?.abort();
    };
    request.onerror = () =>
      absent
        ? resolve(null)
        : reject(
            new Error(
              "Media storage could not be inspected. Its existing data has not been changed.",
            ),
          );
    request.onblocked = () => {
      failed = true;
      reject(
        new Error(
          "Close another LEXIS media tab before inspecting this backup.",
        ),
      );
    };
    request.onsuccess = () => {
      const database = request.result;
      if (failed) {
        database.close();
        return;
      }
      if (
        database.version !== 1 ||
        !database.objectStoreNames.contains("assets") ||
        !database.objectStoreNames.contains("sessions")
      ) {
        database.close();
        reject(
          new Error(
            "This media database version is not supported by the backup reader. Its original data is preserved.",
          ),
        );
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}
interface MediaBackupRows {
  assets: LocalMediaMetadata[];
  sessions: ListeningSession[];
}
async function readMediaBackupRows(
  options?: MediaBackupReadOptions,
): Promise<MediaBackupRows> {
  checkBackupRead(options);
  const database = await openMediaBackupDatabase();
  try {
    checkBackupRead(options);
  } catch (cause) {
    database?.close();
    throw cause;
  }
  if (!database) return { assets: [], sessions: [] };
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      ["assets", "sessions"],
      "readonly",
    );
    const rows: MediaBackupRows = { assets: [], sessions: [] };
    let cause: unknown;
    const assets = transaction.objectStore("assets").openCursor();
    assets.onsuccess = () => {
      const cursor = assets.result;
      if (!cursor) return;
      try {
        checkBackupRead(options);
        if (rows.assets.length >= MEDIA_LIMITS.maxFiles)
          throw new Error(
            "The media library exceeds the supported backup limit.",
          );
        const value = cursor.value as Record<string, unknown>;
        if (
          Object.keys(value).some(
            (key) =>
              ![
                "id",
                "owner",
                "title",
                "fileName",
                "mime",
                "kind",
                "byteLength",
                "createdAt",
                "blob",
                "encoding",
                "data",
              ].includes(key),
          )
        )
          throw new Error(
            "A media record contains unsupported fields. Its original data has been kept.",
          );
        const metadata = mediaMetadata(value);
        if (cursor.primaryKey !== metadata.id)
          throw new Error("A media record has a conflicting identity.");
        rows.assets.push(metadata);
        cursor.continue();
      } catch (error) {
        cause = error;
        transaction.abort();
      }
    };
    const sessions = transaction.objectStore("sessions").openCursor();
    sessions.onsuccess = () => {
      const cursor = sessions.result;
      if (!cursor) return;
      try {
        checkBackupRead(options);
        if (rows.sessions.length >= MEDIA_BACKUP_MAX_SESSIONS)
          throw new Error(
            "The listening history exceeds the supported backup limit.",
          );
        const session = canonicalMediaSession(cursor.value);
        if (cursor.primaryKey !== session.id)
          throw new Error("A listening session has a conflicting identity.");
        rows.sessions.push(session);
        cursor.continue();
      } catch (error) {
        cause = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      const order = (a: { id: string }, b: { id: string }) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      rows.assets.sort(order);
      rows.sessions.sort(order);
      resolve(rows);
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        cause ??
          new Error(
            "The media inventory could not be read. No recording or transcript was changed.",
          ),
      );
    };
  });
}
/** Reads one asset only. The caller may require the digest from its earlier inventory. */
export async function readMediaBackupAsset(
  sourceId: string,
  expectedSha256?: string,
  options?: MediaBackupReadOptions,
): Promise<LocalMediaAsset | null> {
  checkBackupRead(options);
  const database = await openMediaBackupDatabase();
  try {
    checkBackupRead(options);
  } catch (cause) {
    database?.close();
    throw cause;
  }
  if (!database) {
    if (expectedSha256)
      throw new Error(
        "A recording was removed while its backup was being prepared. Try exporting again.",
      );
    return null;
  }
  const asset = await new Promise<LocalMediaAsset | null>((resolve, reject) => {
    const transaction = database.transaction("assets", "readonly");
    const request = transaction.objectStore("assets").get(sourceId);
    let result: LocalMediaAsset | null = null;
    let cause: unknown;
    request.onsuccess = () => {
      try {
        checkBackupRead(options);
        result =
          request.result === undefined
            ? null
            : decodeStoredMedia(request.result);
        if (result && result.id !== sourceId)
          throw new Error("The selected recording has a conflicting identity.");
      } catch (error) {
        cause = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        cause ??
          new Error(
            "A recording could not be read for backup. Its original bytes are preserved.",
          ),
      );
    };
  });
  checkBackupRead(options);
  if (!asset) {
    if (expectedSha256)
      throw new Error(
        "A recording changed or was removed during export. Try exporting again.",
      );
    return null;
  }
  if (expectedSha256) {
    const actual = await sha256MediaBytes(await asset.blob.arrayBuffer());
    checkBackupRead(options);
    if (actual !== expectedSha256)
      throw new Error(
        "A recording's bytes changed during export. No incomplete backup was confirmed.",
      );
  }
  return asset;
}

/** One persisted session only; absence remains distinct from a generated initial session. */
export async function readMediaBackupSession(
  sourceId: string,
  options?: MediaBackupReadOptions,
): Promise<ListeningSession | null> {
  checkBackupRead(options);
  const database = await openMediaBackupDatabase();
  try {
    checkBackupRead(options);
  } catch (cause) {
    database?.close();
    throw cause;
  }
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("sessions", "readonly");
    const request = transaction
      .objectStore("sessions")
      .get(`session:${sourceId}`);
    let result: ListeningSession | null = null;
    let cause: unknown;
    request.onsuccess = () => {
      try {
        checkBackupRead(options);
        result =
          request.result === undefined
            ? null
            : canonicalMediaSession(request.result);
        if (result && result.sourceId !== sourceId)
          throw new Error(
            "A listening session has a conflicting source identity.",
          );
      } catch (error) {
        cause = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        cause ??
          new Error(
            "The listening session could not be inspected. Its original data is preserved.",
          ),
      );
    };
  });
}

/** Stable, bounded inventory; hashes only one recording at a time and rechecks metadata. */
export async function readMediaBackupSnapshot(
  options?: MediaBackupReadOptions,
): Promise<MediaBackupSnapshot> {
  const before = await readMediaBackupRows(options);
  const assets: MediaBackupAssetMetadata[] = [];
  options?.onProgress?.(0, before.assets.length);
  for (const metadata of before.assets) {
    checkBackupRead(options);
    const asset = await readMediaBackupAsset(metadata.id, undefined, options);
    if (!asset)
      throw new Error(
        "A recording was removed during export. Try preparing the backup again.",
      );
    const currentMetadata = mediaMetadata(asset);
    if (JSON.stringify(metadata) !== JSON.stringify(currentMetadata))
      throw new Error(
        "The media library changed during export. Try preparing the backup again.",
      );
    const sha256 = await sha256MediaBytes(await asset.blob.arrayBuffer());
    checkBackupRead(options);
    assets.push(parseMediaBackupAsset({ ...metadata, sha256 }));
    options?.onProgress?.(assets.length, before.assets.length);
  }
  const after = await readMediaBackupRows(options);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(
      "Listening data changed while the backup was being prepared. Try exporting again; the original data is unchanged.",
    );
  checkBackupRead(options);
  return createMediaBackupSnapshot(assets, before.sessions);
}

function authorizeMediaRestoreStep(
  operationId: string,
  kind: "media-asset" | "media-session",
  target: string,
  beforeHash: string | null,
  afterHash: string,
): void {
  const marker = assertProfileRestoreWrite(operationId);
  const step = marker.steps.find(
    (item) => item.kind === kind && item.target === target,
  );
  if (!step || step.beforeHash !== beforeHash || step.afterHash !== afterHash)
    throw new Error(
      "This recording or listening session is not part of the confirmed recovery plan. Nothing was overwritten.",
    );
}

/** Existing file IDs are immutable: import adds an absent file or verifies an identical retry. */
export async function restoreMediaBackupAsset(
  incoming: MediaBackupAssetMetadata,
  blob: Blob,
  expected: MediaBackupAssetMetadata | null,
  operationId: string,
): Promise<{ applied: boolean; asset: MediaBackupAssetMetadata }> {
  const metadata = parseMediaBackupAsset(incoming);
  const afterHash = await mediaBackupAssetFingerprint(metadata);
  const beforeHash = expected
    ? await mediaBackupAssetFingerprint(expected)
    : null;
  authorizeMediaRestoreStep(
    operationId,
    "media-asset",
    metadata.id,
    beforeHash,
    afterHash,
  );
  if (blob.size !== metadata.byteLength)
    throw new Error(
      "A backup recording has a different byte length. Nothing was restored.",
    );
  const data = await blob.arrayBuffer();
  if ((await sha256MediaBytes(data)) !== metadata.sha256)
    throw new Error(
      "A backup recording's fingerprint does not match its bytes. Nothing was restored.",
    );
  const actualType = sniffMedia(
    new Uint8Array(data, 0, Math.min(64, data.byteLength)),
    metadata.fileName,
    metadata.mime,
  );
  if (actualType.kind !== metadata.kind || actualType.mime !== metadata.mime)
    throw new Error(
      "A backup recording's actual format does not match its metadata. Nothing was restored.",
    );
  const existing = await readMediaBackupAsset(metadata.id);
  if (existing) {
    const { blob: existingBlob, ...details } = existing;
    const original = parseMediaBackupAsset({
      ...details,
      sha256: await sha256MediaBytes(await existingBlob.arrayBuffer()),
    });
    authorizeMediaRestoreStep(
      operationId,
      "media-asset",
      metadata.id,
      beforeHash,
      afterHash,
    );
    if (sameMediaBackupAsset(original, metadata))
      return { applied: false, asset: original };
    throw new Error(
      "This recording ID already contains different original data. Its file has not been overwritten.",
    );
  }
  if (expected)
    throw new Error(
      "This recording changed after preview. Prepare a new recovery preview before continuing.",
    );
  const database = await openDatabase(operationId);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("assets", "readwrite");
    const store = transaction.objectStore("assets");
    let failure: unknown;
    const request = store.get(metadata.id);
    request.onsuccess = () => {
      try {
        authorizeMediaRestoreStep(
          operationId,
          "media-asset",
          metadata.id,
          beforeHash,
          afterHash,
        );
        if (request.result !== undefined)
          throw new Error(
            "The media library changed after preview. Existing files have not been overwritten.",
          );
        const count = store.count();
        count.onsuccess = () => {
          try {
            authorizeMediaRestoreStep(
              operationId,
              "media-asset",
              metadata.id,
              beforeHash,
              afterHash,
            );
            if (count.result >= MEDIA_LIMITS.maxFiles)
              throw new Error(
                "The restored media library would exceed the 10-file limit.",
              );
            const originalMetadata = mediaMetadata({ ...metadata, blob });
            store.add({
              ...originalMetadata,
              blob: null,
              encoding: "array-buffer-v1",
              data,
            });
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve({ applied: true, asset: metadata });
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        failure ??
          new Error(
            "The recording could not be restored on this device. Existing files are intact; the recovery journal can be resumed.",
          ),
      );
    };
  });
}

/** Preserves exact revisions, assistance and transcripts; no automatic position override. */
export async function restoreMediaBackupSession(
  incoming: ListeningSession,
  expected: ListeningSession | null,
  operationId: string,
): Promise<{ applied: boolean; session: ListeningSession }> {
  const session = canonicalMediaSession(incoming);
  const afterHash = await mediaBackupSessionFingerprint(session);
  const beforeHash = expected
    ? await mediaBackupSessionFingerprint(expected)
    : null;
  authorizeMediaRestoreStep(
    operationId,
    "media-session",
    session.sourceId,
    beforeHash,
    afterHash,
  );
  const database = await openDatabase(operationId);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("sessions", "readwrite");
    const store = transaction.objectStore("sessions");
    let applied = false;
    let failure: unknown;
    const get = store.get(session.id);
    get.onsuccess = () => {
      try {
        authorizeMediaRestoreStep(
          operationId,
          "media-session",
          session.sourceId,
          beforeHash,
          afterHash,
        );
        const current =
          get.result === undefined ? null : canonicalMediaSession(get.result);
        if (current) {
          if (sameMediaBackupSession(current, session)) return;
          throw new Error(
            "This listening session has changed. Its current position, transcript and history have not been overwritten.",
          );
        }
        if (expected)
          throw new Error(
            "This listening session changed after preview. Prepare a new recovery preview.",
          );
        const count = store.count();
        count.onsuccess = () => {
          try {
            authorizeMediaRestoreStep(
              operationId,
              "media-session",
              session.sourceId,
              beforeHash,
              afterHash,
            );
            if (count.result >= MEDIA_BACKUP_MAX_SESSIONS)
              throw new Error(
                "The listening session library exceeds the supported recovery limit.",
              );
            store.add(session);
            applied = true;
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve({ applied, session });
    };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(
        failure ??
          new Error(
            "The listening session could not be restored. Existing sessions remain intact; recovery can be resumed.",
          ),
      );
    };
  });
}
